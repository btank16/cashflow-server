/**
 * Usage tracking utilities for Cashflow Access System
 *
 * Handles billing-cycle-aware usage tracking with DynamoDB.
 * Each user's billing period is anchored to their first usage date.
 * Billing periods run from anchor day to anchor day (e.g., Dec 15 → Jan 14).
 * Handles month-length edge cases (e.g., Jan 31 → Feb 28).
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type { UserEntitlements } from './authorization';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export interface UsageStatus {
  monthlyUsed: number;
  monthlyLimit: number | null;
  monthlyRemaining: number | null;
  periodStart: string;      // YYYY-MM-DD
  periodEnd: string;        // YYYY-MM-DD
  canProceed: boolean;
  limitReached: boolean;
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
 * Get the day of month from a date string in the user's timezone.
 */
function getDayOfMonth(timezone: string): number {
  const dateStr = getDateInTimezone(timezone);
  return parseInt(dateStr.split('-')[2], 10);
}

/**
 * Calculate the adjusted anchor day for a given month.
 * Handles months with fewer days (e.g., anchor 31 in February → 28/29).
 */
function getAdjustedAnchorDay(anchorDay: number, year: number, month: number): number {
  // Get the last day of the month
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return Math.min(anchorDay, lastDayOfMonth);
}

/**
 * Calculate the current billing period start and end dates.
 *
 * @param anchorDay - The user's billing anchor day (1-31)
 * @param timezone - User's timezone
 * @returns Object with periodStart and periodEnd as YYYY-MM-DD strings
 */
function calculateBillingPeriod(
  anchorDay: number,
  timezone: string
): { periodStart: string; periodEnd: string } {
  const todayStr = getDateInTimezone(timezone);
  const [yearStr, monthStr, dayStr] = todayStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed
  const day = parseInt(dayStr, 10);

  // Get the adjusted anchor day for current month
  const adjustedAnchorThisMonth = getAdjustedAnchorDay(anchorDay, year, month);

  let periodStartYear: number;
  let periodStartMonth: number;
  let periodStartDay: number;

  if (day >= adjustedAnchorThisMonth) {
    // We're in a period that started this month
    periodStartYear = year;
    periodStartMonth = month;
    periodStartDay = adjustedAnchorThisMonth;
  } else {
    // We're in a period that started last month
    if (month === 0) {
      periodStartYear = year - 1;
      periodStartMonth = 11; // December
    } else {
      periodStartYear = year;
      periodStartMonth = month - 1;
    }
    periodStartDay = getAdjustedAnchorDay(anchorDay, periodStartYear, periodStartMonth);
  }

  // Calculate period end (day before next anchor)
  let periodEndYear: number;
  let periodEndMonth: number;
  let periodEndDay: number;

  if (day >= adjustedAnchorThisMonth) {
    // Period ends next month
    if (month === 11) {
      periodEndYear = year + 1;
      periodEndMonth = 0; // January
    } else {
      periodEndYear = year;
      periodEndMonth = month + 1;
    }
    const nextAnchor = getAdjustedAnchorDay(anchorDay, periodEndYear, periodEndMonth);
    // End is day before next anchor
    const endDate = new Date(periodEndYear, periodEndMonth, nextAnchor);
    endDate.setDate(endDate.getDate() - 1);
    periodEndYear = endDate.getFullYear();
    periodEndMonth = endDate.getMonth();
    periodEndDay = endDate.getDate();
  } else {
    // Period ends this month (day before this month's anchor)
    const endDate = new Date(year, month, adjustedAnchorThisMonth);
    endDate.setDate(endDate.getDate() - 1);
    periodEndYear = endDate.getFullYear();
    periodEndMonth = endDate.getMonth();
    periodEndDay = endDate.getDate();
  }

  const periodStart = `${periodStartYear}-${String(periodStartMonth + 1).padStart(2, '0')}-${String(periodStartDay).padStart(2, '0')}`;
  const periodEnd = `${periodEndYear}-${String(periodEndMonth + 1).padStart(2, '0')}-${String(periodEndDay).padStart(2, '0')}`;

  return { periodStart, periodEnd };
}

/**
 * Build the key for storing/retrieving the user's billing anchor.
 * Format: anchor#timezone#functionName
 */
function buildAnchorKey(timezone: string, functionName: string): string {
  return `anchor#${timezone}#${functionName}`;
}

/**
 * Build the key for billing period usage tracking.
 * Format: billing#YYYY-MM-DD#timezone#functionName
 * The date is the period start date.
 */
function buildBillingPeriodKey(
  periodStart: string,
  timezone: string,
  functionName: string
): string {
  return `billing#${periodStart}#${timezone}#${functionName}`;
}

/**
 * Get or create the user's billing anchor day.
 * On first usage, sets the anchor to today's day of month.
 *
 * @param tableName - DynamoDB table name
 * @param userId - User's ID
 * @param functionName - Function being tracked (e.g., 'resident-ai')
 * @param timezone - User's timezone
 * @param tier - User's current tier
 * @returns The anchor day (1-31)
 */
async function getOrCreateAnchorDay(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  tier: string
): Promise<number> {
  const anchorKey = buildAnchorKey(timezone, functionName);

  // Try to get existing anchor
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { userId, periodFunction: anchorKey },
      })
    );

    if (result.Item?.anchorDay) {
      return result.Item.anchorDay;
    }
  } catch (error) {
    console.error('Error fetching anchor:', error);
  }

  // Create new anchor based on today's date
  const anchorDay = getDayOfMonth(timezone);
  const now = new Date().toISOString();

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          userId,
          periodFunction: anchorKey,
          anchorDay,
          tier,
          createdAt: now,
          updatedAt: now,
        },
        // Only create if doesn't exist (prevent race condition)
        ConditionExpression: 'attribute_not_exists(userId)',
      })
    );
    console.log(`Created billing anchor for user ${userId}: day ${anchorDay}`);
  } catch (error: any) {
    // If condition failed, another request created it - fetch it
    if (error.name === 'ConditionalCheckFailedException') {
      const result = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { userId, periodFunction: anchorKey },
        })
      );
      return result.Item?.anchorDay || anchorDay;
    }
    console.error('Error creating anchor:', error);
  }

  return anchorDay;
}

/**
 * Reset the user's billing anchor to today (used when user upgrades tier).
 */
export async function resetBillingAnchor(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  tier: string
): Promise<number> {
  const anchorKey = buildAnchorKey(timezone, functionName);
  const anchorDay = getDayOfMonth(timezone);
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { userId, periodFunction: anchorKey },
      UpdateExpression: 'SET anchorDay = :day, tier = :tier, updatedAt = :now, resetAt = :now',
      ExpressionAttributeValues: {
        ':day': anchorDay,
        ':tier': tier,
        ':now': now,
      },
    })
  );

  console.log(`Reset billing anchor for user ${userId}: day ${anchorDay}`);
  return anchorDay;
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
  // Get or create billing anchor
  const anchorDay = await getOrCreateAnchorDay(
    tableName,
    userId,
    functionName,
    timezone,
    entitlements.tier
  );

  // Calculate current billing period
  const { periodStart, periodEnd } = calculateBillingPeriod(anchorDay, timezone);
  const billingKey = buildBillingPeriodKey(periodStart, timezone, functionName);

  // Fetch current period usage
  let monthlyUsed = 0;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { userId, periodFunction: billingKey },
      })
    );
    monthlyUsed = result.Item?.count || 0;
  } catch (error) {
    console.error('Error fetching usage:', error);
  }

  const { monthlyLimit } = entitlements;

  // Calculate remaining (null means unlimited)
  const monthlyRemaining =
    monthlyLimit !== null ? Math.max(0, monthlyLimit - monthlyUsed) : null;

  // Determine if limit is reached
  const limitReached = monthlyLimit !== null && monthlyUsed >= monthlyLimit;

  return {
    monthlyUsed,
    monthlyLimit,
    monthlyRemaining,
    periodStart,
    periodEnd,
    canProceed: !limitReached,
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
  const { monthlyLimit } = entitlements;

  // Get or create billing anchor
  const anchorDay = await getOrCreateAnchorDay(
    tableName,
    userId,
    functionName,
    timezone,
    entitlements.tier
  );

  // Calculate current billing period
  const { periodStart, periodEnd } = calculateBillingPeriod(anchorDay, timezone);

  // If user has unlimited access (null limit), just increment without condition
  if (monthlyLimit === null) {
    await incrementUsageUnlimited(tableName, userId, functionName, timezone, periodStart, entitlements.tier);
    const usage = await getUsageStatus(tableName, userId, functionName, timezone, entitlements);
    return { success: true, usage };
  }

  // If limit is 0, user has no access
  if (monthlyLimit === 0) {
    const usage: UsageStatus = {
      monthlyUsed: 0,
      monthlyLimit: 0,
      monthlyRemaining: 0,
      periodStart,
      periodEnd,
      canProceed: false,
      limitReached: true,
    };
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
    periodStart,
    entitlements.tier,
    monthlyLimit
  );

  if (!result.success) {
    const usage = await getUsageStatus(tableName, userId, functionName, timezone, entitlements);
    return {
      success: false,
      error: `Monthly limit of ${monthlyLimit} reached. Your limit resets on ${periodEnd}.`,
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
 * Atomically increment usage only if under the monthly limit.
 * Uses DynamoDB conditional expression to prevent race conditions.
 * Returns { success: true } if incremented, { success: false } if limit reached.
 */
async function atomicIncrementIfUnderLimit(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  periodStart: string,
  tier: string,
  monthlyLimit: number
): Promise<{ success: boolean }> {
  const billingKey = buildBillingPeriodKey(periodStart, timezone, functionName);

  // TTL: 40 days from now for automatic cleanup
  const ttl = Math.floor(Date.now() / 1000) + 40 * 24 * 60 * 60;

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { userId, periodFunction: billingKey },
        UpdateExpression:
          'SET #count = if_not_exists(#count, :zero) + :inc, tier = :tier, #ttl = :ttl, updatedAt = :now, createdAt = if_not_exists(createdAt, :now), periodStart = :periodStart',
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
          ':limit': monthlyLimit,
          ':periodStart': periodStart,
        },
      })
    );
    return { success: true };
  } catch (error: any) {
    // ConditionalCheckFailedException means limit was reached
    if (error.name === 'ConditionalCheckFailedException') {
      console.log('Monthly usage limit reached (atomic check)');
      return { success: false };
    }
    // For other errors, log and rethrow
    console.error('Failed to atomically increment usage:', error);
    throw error;
  }
}

/**
 * Increment usage counter for unlimited users (no conditional check needed).
 */
async function incrementUsageUnlimited(
  tableName: string,
  userId: string,
  functionName: string,
  timezone: string,
  periodStart: string,
  tier: string,
  maxRetries: number = 3
): Promise<void> {
  const billingKey = buildBillingPeriodKey(periodStart, timezone, functionName);

  // TTL: 40 days from now for automatic cleanup
  const ttl = Math.floor(Date.now() / 1000) + 40 * 24 * 60 * 60;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { userId, periodFunction: billingKey },
          UpdateExpression:
            'SET #count = if_not_exists(#count, :zero) + :inc, tier = :tier, #ttl = :ttl, updatedAt = :now, createdAt = if_not_exists(createdAt, :now), periodStart = :periodStart',
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
            ':periodStart': periodStart,
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
