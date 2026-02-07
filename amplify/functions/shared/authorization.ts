/**
 * Authorization utilities for Cashflow Beta Access System
 *
 * Handles entitlement resolution and access control checks.
 * Supports RevenueCat subscription integration with Cognito group fallback.
 */

import { TIERS, TierName, getTierFromCognitoGroups, tierHasFeature, FEATURES, COGNITO_GROUPS } from './tiers';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB client (lazy initialization)
let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const dynamoClient = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(dynamoClient);
  }
  return docClient;
}

/**
 * UserSubscription record from DynamoDB
 */
export interface UserSubscriptionRecord {
  userId: string;
  revenueCatAppUserId?: string;
  productId?: string;
  platform?: 'ios' | 'android';
  tier?: TierName;
  status?: 'active' | 'expired' | 'in_grace_period' | 'paused' | 'canceled' | 'trialing' | 'legacy';
  purchaseDate?: string;
  expiresDate?: string;
  lastEventId?: string;
  lastSyncedAt?: string;
  syncSource?: 'webhook' | 'client' | 'admin';
  migratedFromCognitoGroup?: string;
  migrationDate?: string;
}

/**
 * Cognito identity structure from AppSync Lambda events
 */
export interface CognitoIdentity {
  sub?: string;
  claims?: {
    sub?: string;
    'cognito:groups'?: string | string[];
    email?: string;
    [key: string]: unknown;
  };
  'cognito:groups'?: string | string[];
}

/**
 * Lambda event identity (may be CognitoIdentity or other auth types)
 * Using unknown to accept various AWS identity types safely
 */
export type LambdaEventIdentity = unknown;

export interface UserEntitlements {
  tier: TierName;
  displayName: string;
  monthlyLimit: number | null;
  features: string[];
  source: 'cognito-group' | 'subscription';
  isAdmin: boolean;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  entitlements: UserEntitlements;
}

/**
 * Extract Cognito groups from Lambda event identity.
 * Handles both AppSync and direct invocation formats.
 * Accepts various AWS identity types safely with runtime checks.
 */
export function extractCognitoGroups(identity: LambdaEventIdentity): string[] {
  if (!identity || typeof identity !== 'object') return [];

  // AppSync event format: identity.claims['cognito:groups']
  const claims = (identity as CognitoIdentity).claims;
  if (claims?.['cognito:groups']) {
    const groups = claims['cognito:groups'];
    return Array.isArray(groups) ? groups : [groups];
  }

  // Direct format: identity['cognito:groups']
  const directGroups = (identity as CognitoIdentity)['cognito:groups'];
  if (directGroups) {
    return Array.isArray(directGroups) ? directGroups : [directGroups];
  }

  return [];
}

/**
 * Get user subscription from DynamoDB UserSubscription table.
 * Returns null if no subscription found or table not configured.
 */
export async function getActiveSubscription(userId: string): Promise<UserSubscriptionRecord | null> {
  const tableName = process.env.SUBSCRIPTION_TABLE_NAME;
  if (!tableName) {
    // Table not configured, fall back to Cognito groups
    return null;
  }

  try {
    const result = await getDocClient().send(
      new GetCommand({
        TableName: tableName,
        Key: { userId },
      })
    );

    if (!result.Item) {
      return null;
    }

    const subscription = result.Item as UserSubscriptionRecord;

    // Check if subscription is active (active, in_grace_period, or canceled but not expired)
    const activeStatuses = ['active', 'in_grace_period', 'canceled', 'trialing'];
    if (!subscription.status || !activeStatuses.includes(subscription.status)) {
      return null;
    }

    // Check if subscription has expired
    if (subscription.expiresDate) {
      const expiresDate = new Date(subscription.expiresDate);
      if (expiresDate < new Date()) {
        return null;
      }
    }

    return subscription;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

/**
 * Get user entitlements from subscription table or Cognito groups.
 * Checks UserSubscription table first for RevenueCat subscriptions,
 * then falls back to Cognito groups for beta/admin users.
 */
export function getUserEntitlements(cognitoGroups: string[]): UserEntitlements {
  // Synchronous version - derive entitlements from Cognito groups
  // For async subscription check, use getUserEntitlementsAsync
  const tier = getTierFromCognitoGroups(cognitoGroups);
  const tierConfig = TIERS[tier];

  return {
    tier,
    displayName: tierConfig.displayName,
    monthlyLimit: tierConfig.monthlyLimit,
    features: tierConfig.features,
    source: 'cognito-group',
    isAdmin: cognitoGroups.includes(COGNITO_GROUPS.ADMIN),
  };
}

/**
 * Get user entitlements with async subscription table check.
 * Checks UserSubscription table first for RevenueCat subscriptions,
 * then falls back to Cognito groups for beta/admin users.
 */
export async function getUserEntitlementsAsync(
  userId: string,
  cognitoGroups: string[]
): Promise<UserEntitlements> {
  // Check UserSubscription table first for active RevenueCat subscription
  const subscription = await getActiveSubscription(userId);

  if (subscription && subscription.tier) {
    const tierConfig = TIERS[subscription.tier];
    return {
      tier: subscription.tier,
      displayName: tierConfig.displayName,
      monthlyLimit: tierConfig.monthlyLimit,
      features: tierConfig.features,
      source: 'subscription',
      isAdmin: cognitoGroups.includes(COGNITO_GROUPS.ADMIN),
    };
  }

  // Fall back to Cognito groups (for beta/admin users or users without subscription)
  const tier = getTierFromCognitoGroups(cognitoGroups);
  const tierConfig = TIERS[tier];

  return {
    tier,
    displayName: tierConfig.displayName,
    monthlyLimit: tierConfig.monthlyLimit,
    features: tierConfig.features,
    source: 'cognito-group',
    isAdmin: cognitoGroups.includes(COGNITO_GROUPS.ADMIN),
  };
}

/**
 * Check if user has access to the resident-AI feature.
 */
export function checkResidentAIAccess(cognitoGroups: string[]): AccessCheckResult {
  const entitlements = getUserEntitlements(cognitoGroups);

  // Check feature access
  if (!tierHasFeature(entitlements.tier, FEATURES.RESIDENT_AI)) {
    return {
      allowed: false,
      reason: `resident-AI requires beta access or higher. You're on the ${entitlements.displayName} tier.`,
      entitlements,
    };
  }

  return {
    allowed: true,
    entitlements,
  };
}

/**
 * Check if user is an admin.
 */
export function isAdmin(cognitoGroups: string[]): boolean {
  return cognitoGroups.includes(COGNITO_GROUPS.ADMIN);
}

/**
 * Extract user ID from Lambda event identity.
 * Accepts various AWS identity types safely with runtime checks.
 */
export function extractUserId(identity: LambdaEventIdentity): string | null {
  if (!identity || typeof identity !== 'object') return null;

  const cognitoIdentity = identity as CognitoIdentity;

  // AppSync format
  if (cognitoIdentity.sub) return cognitoIdentity.sub;
  if (cognitoIdentity.claims?.sub) return cognitoIdentity.claims.sub;

  return null;
}
