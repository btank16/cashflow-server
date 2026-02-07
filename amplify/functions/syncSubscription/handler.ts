/**
 * Sync Subscription Handler
 *
 * Client-side sync endpoint for RevenueCat subscription verification.
 * Called after purchases or to verify subscription state.
 *
 * Flow:
 * 1. Receive RevenueCat app_user_id from authenticated client
 * 2. Call RevenueCat API to get current subscription status
 * 3. Update Cognito groups based on subscription tier
 * 4. Update UserSubscription table
 * 5. Return updated entitlements to client
 */

import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  fetchRevenueCatSubscriber,
  getSubscriptionStatus,
  getTierFromProductId,
  getCognitoGroupForTier,
} from '../shared/revenueCatUtils';
import { TierName, COGNITO_GROUPS, getTierFromCognitoGroups, isUpgrade } from '../shared/tiers';
import { extractUserId, CognitoIdentity } from '../shared/authorization';
import { resetBillingAnchor } from '../shared/usage';

interface SyncSubscriptionArgs {
  revenueCatAppUserId: string;
}

interface SyncSubscriptionResponse {
  success: boolean;
  tier?: string;
  status?: string;
  expiresDate?: string;
  error?: string;
}

interface LambdaEvent {
  arguments: SyncSubscriptionArgs;
  identity: CognitoIdentity;
}

// Initialize AWS clients
const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Paid tier groups that should be managed by this function
const PAID_TIER_GROUPS = [
  COGNITO_GROUPS.PREMIUM,
  COGNITO_GROUPS.PLATINUM,
];

export const handler = async (event: LambdaEvent): Promise<SyncSubscriptionResponse> => {
  console.log('syncSubscription invoked');

  const { revenueCatAppUserId } = event.arguments;
  const userId = extractUserId(event.identity);

  if (!userId) {
    return {
      success: false,
      error: 'Unable to identify user',
    };
  }

  if (!revenueCatAppUserId) {
    return {
      success: false,
      error: 'Missing required field: revenueCatAppUserId',
    };
  }

  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) {
    console.error('REVENUECAT_API_KEY not configured');
    return {
      success: false,
      error: 'Server configuration error',
    };
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    console.error('COGNITO_USER_POOL_ID not configured');
    return {
      success: false,
      error: 'Server configuration error',
    };
  }

  const subscriptionTableName = process.env.SUBSCRIPTION_TABLE_NAME;
  if (!subscriptionTableName) {
    console.error('SUBSCRIPTION_TABLE_NAME not configured');
    return {
      success: false,
      error: 'Server configuration error',
    };
  }

  // Usage table is optional - if not configured, we skip billing anchor reset
  const usageTableName = process.env.USAGE_TABLE_NAME;
  if (!usageTableName) {
    console.warn('USAGE_TABLE_NAME not configured - billing anchor reset on upgrade will be skipped');
  }

  try {
    // Fetch subscriber info from RevenueCat
    console.log(`Fetching RevenueCat subscriber: ${revenueCatAppUserId}`);
    const subscriberInfo = await fetchRevenueCatSubscriber(revenueCatAppUserId, apiKey);

    // Determine current subscription status
    const { status, productId, expiresDate } = getSubscriptionStatus(
      subscriberInfo.subscriber.subscriptions
    );

    console.log(`RevenueCat status: ${status}, productId: ${productId}, expires: ${expiresDate}`);

    // Determine tier from product
    let tier: TierName = 'basic';
    if (productId && (status === 'active' || status === 'in_grace_period' || status === 'canceled')) {
      const mappedTier = getTierFromProductId(productId);
      if (mappedTier) {
        tier = mappedTier;
      }
    }

    console.log(`Mapped tier: ${tier}`);

    // Get current Cognito groups
    const currentGroupsResponse = await cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: userId,
      })
    );

    const currentGroups = currentGroupsResponse.Groups?.map(g => g.GroupName || '') || [];
    console.log(`Current Cognito groups: ${currentGroups.join(', ')}`);

    // Determine current tier before making changes
    const currentTier = getTierFromCognitoGroups(currentGroups);

    // Check if this is an upgrade - if so, reset billing anchor
    if (isUpgrade(currentTier, tier) && usageTableName) {
      // Try to get timezone from RevenueCat subscriber attributes, fallback to UTC
      const timezone = subscriberInfo.subscriber.subscriber_attributes?.['$timezone']?.value || 'UTC';
      console.log(`Upgrade detected (${currentTier} → ${tier}), resetting billing anchor with timezone: ${timezone}`);

      try {
        await resetBillingAnchor(usageTableName, userId, 'resident-ai', timezone, tier);
        console.log('Billing anchor reset successfully');
      } catch (error) {
        console.error('Failed to reset billing anchor:', error);
        // Continue with sync even if anchor reset fails
      }
    }

    // Determine target group based on tier
    const targetPaidGroup = tier !== 'basic' ? getCognitoGroupForTier(tier) : null;

    // Remove from paid tier groups that don't match
    for (const group of PAID_TIER_GROUPS) {
      if (currentGroups.includes(group) && group !== targetPaidGroup) {
        console.log(`Removing user from group: ${group}`);
        await cognitoClient.send(
          new AdminRemoveUserFromGroupCommand({
            UserPoolId: userPoolId,
            Username: userId,
            GroupName: group,
          })
        );
      }
    }

    // If user is subscribing from beta, remove beta group
    if (targetPaidGroup && currentGroups.includes(COGNITO_GROUPS.BETA)) {
      console.log('Removing user from beta group (upgrading to paid tier)');
      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username: userId,
          GroupName: COGNITO_GROUPS.BETA,
        })
      );
    }

    // Add to target paid group if not already a member
    if (targetPaidGroup && !currentGroups.includes(targetPaidGroup)) {
      console.log(`Adding user to group: ${targetPaidGroup}`);
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: userId,
          GroupName: targetPaidGroup,
        })
      );
    }

    // Update UserSubscription table
    const now = new Date().toISOString();
    const subscriptionRecord = {
      userId,
      revenueCatAppUserId,
      productId: productId || undefined,
      platform: undefined,  // Will be set by webhook which has store info
      tier,
      status,
      purchaseDate: undefined,  // Will be set by webhook
      expiresDate: expiresDate?.toISOString() || undefined,
      lastEventId: undefined,
      lastSyncedAt: now,
      syncSource: 'client' as const,
      migratedFromCognitoGroup: currentGroups.includes(COGNITO_GROUPS.BETA) ? 'beta' : undefined,
      migrationDate: currentGroups.includes(COGNITO_GROUPS.BETA) ? now : undefined,
    };

    // Filter out undefined values for DynamoDB
    const filteredRecord = Object.fromEntries(
      Object.entries(subscriptionRecord).filter(([_, v]) => v !== undefined)
    );

    await docClient.send(
      new PutCommand({
        TableName: subscriptionTableName,
        Item: filteredRecord,
      })
    );

    console.log('UserSubscription table updated');

    return {
      success: true,
      tier,
      status,
      expiresDate: expiresDate?.toISOString(),
    };
  } catch (error) {
    console.error('Error syncing subscription:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};
