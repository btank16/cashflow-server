/**
 * Get Entitlements Handler
 *
 * Returns the calling user's entitlements and current usage information.
 * Uses timezone-aware daily usage calculation.
 */

import {
  getUserEntitlements,
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
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyUsed: number;
  dailyRemaining: number | null;
  monthlyUsed: number;
  monthlyRemaining: number | null;
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

  // Get entitlements from Cognito groups
  const entitlements = getUserEntitlements(cognitoGroups);

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
    dailyUsed: usage.dailyUsed,
    dailyRemaining: usage.dailyRemaining,
    canUseResidentAI,
  });

  return {
    tier: entitlements.tier,
    displayName: entitlements.displayName,
    dailyLimit: entitlements.dailyLimit,
    monthlyLimit: entitlements.monthlyLimit,
    dailyUsed: usage.dailyUsed,
    dailyRemaining: usage.dailyRemaining,
    monthlyUsed: usage.monthlyUsed,
    monthlyRemaining: usage.monthlyRemaining,
    features: entitlements.features,
    canUseResidentAI,
    isAdmin: entitlements.isAdmin,
    source: entitlements.source,
  };
};
