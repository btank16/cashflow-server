/**
 * Get Entitlements Handler
 *
 * Returns the calling user's entitlements and current usage information.
 * Uses billing-cycle-aware usage calculation based on user's anchor date.
 */

import {
  getUserEntitlementsAsync,
  extractCognitoGroups,
  extractUserId,
  checkResidentAIAccess,
  LambdaEventIdentity,
} from '../shared/authorization';
import { getUsageStatus } from '../shared/usage';

interface LambdaEvent {
  arguments: {
    timezone?: string;
  };
  identity: LambdaEventIdentity;
}

interface EntitlementsResponse {
  tier: string;
  displayName: string;
  monthlyLimit: number | null;
  monthlyUsed: number;
  monthlyRemaining: number | null;
  periodStart: string;
  periodEnd: string;
  features: string[];
  canUseResidentAI: boolean;
  isAdmin: boolean;
  source: string;
}

export const handler = async (event: LambdaEvent): Promise<EntitlementsResponse> => {
  console.log('getEntitlements invoked');

  const userId = extractUserId(event.identity);
  const cognitoGroups = extractCognitoGroups(event.identity);
  const timezone = event.arguments?.timezone || 'UTC';
  const usageTableName = process.env.USAGE_TABLE_NAME;

  if (!userId) {
    console.error('No user ID found in event');
    throw new Error('Authentication required');
  }

  if (!usageTableName) {
    console.error('USAGE_TABLE_NAME environment variable not set');
    throw new Error('Server configuration error');
  }

  console.log(`Getting entitlements for user ${userId} in timezone ${timezone}`);

  // Get entitlements - checks UserSubscription table first, then falls back to Cognito groups
  const entitlements = await getUserEntitlementsAsync(userId, cognitoGroups);

  // Get current usage
  const usage = await getUsageStatus(
    usageTableName,
    userId,
    'resident-ai',
    timezone,
    entitlements
  );

  // Check if user can use resident-AI (feature access + within limits)
  const accessCheck = checkResidentAIAccess(cognitoGroups);
  const canUseResidentAI = accessCheck.allowed && usage.canProceed;

  console.log(`User ${userId} entitlements:`, {
    tier: entitlements.tier,
    monthlyUsed: usage.monthlyUsed,
    monthlyRemaining: usage.monthlyRemaining,
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
    canUseResidentAI,
  });

  return {
    tier: entitlements.tier,
    displayName: entitlements.displayName,
    monthlyLimit: entitlements.monthlyLimit,
    monthlyUsed: usage.monthlyUsed,
    monthlyRemaining: usage.monthlyRemaining,
    periodStart: usage.periodStart,
    periodEnd: usage.periodEnd,
    features: entitlements.features,
    canUseResidentAI,
    isAdmin: entitlements.isAdmin,
    source: entitlements.source,
  };
};
