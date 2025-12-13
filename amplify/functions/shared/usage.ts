/**
 * Usage tracking utilities for Cashflow Beta Access System
 *
 * Handles timezone-aware daily usage tracking with DynamoDB.
 * Daily limits reset at midnight in the user's local timezone.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { UserEntitlements } from './authorization';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export interface UsageStatus {
  dailyUsed: number;
  dailyLimit: number | null;
  dailyRemaining: number | null;
  monthlyUsed: number;
  monthlyLimit: number | null;
  monthlyRemaining: number | null;
  canProceed: boolean;
  limitReached: 'daily' | 'monthly' | null;
}

export interface UsageCheckResult {
  success: boolean;
  error?: string;
  usage: UsageStatus;
}

/**
 * Get the current date string in the user's timezone.
 * Returns format: YYYY-MM-DD
 */
export function getDateInTimezone(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now); // Returns YYYY-MM-DD format
  } catch (error) {
    // Fallback to UTC if timezone is invalid
    console.warn(`Invalid timezone "${timezone}", falling back to UTC`);
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Build the period key for daily usage tracking.
 * Format: daily#YYYY-MM-DD#timezone#functionName
 */
function buildDailyPeriodKey(
  dateStr: string,
  timezone: string,
  functionName: string
): string {
  return `daily#${dateStr}#${timezone}#${functionName}`;
}

/**
 * Get current usage status for a user.
 */
export async function getUsageStatus(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  entitlements: UserEntitlements
): Promise<UsageStatus> {
  const today = getDateInTimezone(timezone);
  const dailyPeriodKey = buildDailyPeriodKey(today, timezone, functionName);

  // Fetch daily usage
  let dailyUsed = 0;
  try {
    const dailyResult = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { userId, periodFunction: dailyPeriodKey },
      })
    );
    dailyUsed = dailyResult.Item?.count || 0;
  } catch (error) {
    console.error('Error fetching daily usage:', error);
  }

  // Monthly usage - for future subscription users
  // Beta users have no monthly limit, so we skip this for now
  const monthlyUsed = 0;

  const { dailyLimit, monthlyLimit } = entitlements;

  // Calculate remaining (null means unlimited)
  const dailyRemaining =
    dailyLimit !== null ? Math.max(0, dailyLimit - dailyUsed) : null;
  const monthlyRemaining =
    monthlyLimit !== null ? Math.max(0, monthlyLimit - monthlyUsed) : null;

  // Determine if any limit is reached
  let limitReached: 'daily' | 'monthly' | null = null;

  if (dailyLimit !== null && dailyUsed >= dailyLimit) {
    limitReached = 'daily';
  } else if (monthlyLimit !== null && monthlyUsed >= monthlyLimit) {
    limitReached = 'monthly';
  }

  return {
    dailyUsed,
    dailyLimit,
    dailyRemaining,
    monthlyUsed,
    monthlyLimit,
    monthlyRemaining,
    canProceed: limitReached === null,
    limitReached,
  };
}

/**
 * Check usage limits and increment if allowed (atomic operation).
 * Uses DynamoDB conditional update to prevent race conditions.
 * Returns error message if limit reached, success if incremented.
 */
export async function checkAndIncrementUsage(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  entitlements: UserEntitlements
): Promise<UsageCheckResult> {
  const { dailyLimit } = entitlements;

  // If user has unlimited access (null limit), just increment without condition
  if (dailyLimit === null) {
    await incrementUsageWithRetry(tableName, userId, functionName, timezone, entitlements.tier);
    const usage = await getUsageStatus(tableName, userId, functionName, timezone, entitlements);
    return { success: true, usage };
  }

  // If limit is 0, user has no access
  if (dailyLimit === 0) {
    const usage = await getUsageStatus(tableName, userId, functionName, timezone, entitlements);
    return {
      success: false,
      error: `You don't have access to this feature. Your current tier is ${entitlements.displayName}.`,
      usage,
    };
  }

  // Attempt atomic check-and-increment
  const result = await atomicIncrementIfUnderLimit(
    tableName,
    userId,
    functionName,
    timezone,
    entitlements.tier,
    dailyLimit
  );

  if (!result.success) {
    const usage = await getUsageStatus(tableName, userId, functionName, timezone, entitlements);
    return {
      success: false,
      error: `Daily limit of ${dailyLimit} reached. Your limit resets at midnight.`,
      usage,
    };
  }

  // Return updated usage
  const updatedUsage = await getUsageStatus(
    tableName,
    userId,
    functionName,
    timezone,
    entitlements
  );

  return {
    success: true,
    usage: updatedUsage,
  };
}

/**
 * Atomically increment usage only if under the daily limit.
 * Uses DynamoDB conditional expression to prevent race conditions.
 * Returns { success: true } if incremented, { success: false } if limit reached.
 */
async function atomicIncrementIfUnderLimit(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  tier: string,
  dailyLimit: number
): Promise<{ success: boolean }> {
  const today = getDateInTimezone(timezone);
  const dailyPeriodKey = buildDailyPeriodKey(today, timezone, functionName);

  // TTL: 7 days from now for automatic cleanup
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { userId, periodFunction: dailyPeriodKey },
        UpdateExpression:
          'SET #count = if_not_exists(#count, :zero) + :inc, tier = :tier, #ttl = :ttl, updatedAt = :now',
        // Condition: count must not exist OR be less than limit
        ConditionExpression:
          'attribute_not_exists(#count) OR #count < :limit',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl',
        },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':inc': 1,
          ':tier': tier,
          ':ttl': ttl,
          ':now': new Date().toISOString(),
          ':limit': dailyLimit,
        },
      })
    );
    return { success: true };
  } catch (error: any) {
    // ConditionalCheckFailedException means limit was reached
    if (error.name === 'ConditionalCheckFailedException') {
      console.log('Usage limit reached (atomic check)');
      return { success: false };
    }
    // For other errors, log and rethrow
    console.error('Failed to atomically increment usage:', error);
    throw error;
  }
}

/**
 * Increment usage counter with exponential backoff retry.
 * Used for unlimited users where we don't need conditional check.
 */
async function incrementUsageWithRetry(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  tier: string,
  maxRetries: number = 3
): Promise<void> {
  const today = getDateInTimezone(timezone);
  const dailyPeriodKey = buildDailyPeriodKey(today, timezone, functionName);

  // TTL: 7 days from now for automatic cleanup
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { userId, periodFunction: dailyPeriodKey },
          UpdateExpression:
            'SET #count = if_not_exists(#count, :zero) + :inc, tier = :tier, #ttl = :ttl, updatedAt = :now',
          ExpressionAttributeNames: {
            '#count': 'count',
            '#ttl': 'ttl',
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':inc': 1,
            ':tier': tier,
            ':ttl': ttl,
            ':now': new Date().toISOString(),
          },
        })
      );
      return; // Success
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        console.error(`Failed to increment usage after ${maxRetries + 1} attempts:`, error);
        // Don't throw - we don't want to block the user for tracking failures
        return;
      }
      // Exponential backoff: 100ms, 200ms, 400ms
      const backoffMs = 100 * Math.pow(2, attempt);
      console.warn(`Usage increment attempt ${attempt + 1} failed, retrying in ${backoffMs}ms`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
}
