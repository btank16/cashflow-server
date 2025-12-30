/**
 * Authorization utilities for Cashflow Beta Access System
 *
 * Handles entitlement resolution and access control checks.
 * Designed for easy future Stripe integration.
 */

import { TIERS, TierName, getTierFromCognitoGroups, tierHasFeature, FEATURES, COGNITO_GROUPS } from './tiers';

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
 * Get user entitlements from Cognito groups.
 *
 * Future: This function will be modified to check UserSubscription table
 * first for active Stripe subscriptions before falling back to Cognito groups.
 */
export function getUserEntitlements(cognitoGroups: string[]): UserEntitlements {
  // ---------------------------------------------------------
  // FUTURE STRIPE INTEGRATION: Add subscription table check here
  // ---------------------------------------------------------
  // const subscription = await getActiveSubscription(userId);
  // if (subscription && subscription.status === 'active') {
  //   return {
  //     tier: subscription.tier,
  //     displayName: TIERS[subscription.tier].displayName,
  //     monthlyLimit: subscription.monthlyLimit,
  //     features: subscription.features,
  //     source: 'subscription',
  //     isAdmin: cognitoGroups.includes('admin'),
  //   };
  // }
  // ---------------------------------------------------------

  // MVP: Derive entitlements from Cognito groups
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
