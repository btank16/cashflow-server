/**
 * RevenueCat Webhook Handler
 *
 * Handles webhook events from RevenueCat for subscription lifecycle events.
 * This is the primary sync path for subscription state.
 *
 * Event Types Handled:
 * - INITIAL_PURCHASE: New subscription purchased
 * - RENEWAL: Subscription renewed
 * - CANCELLATION: User canceled (still has access until expiry)
 * - EXPIRATION: Subscription expired
 * - PRODUCT_CHANGE: User changed subscription tier
 * - BILLING_ISSUE: Payment failed, entering grace period
 * - UNCANCELLATION: User re-subscribed before expiry
 */

import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  RevenueCatWebhookEvent,
  RevenueCatEventType,
  getTierFromProductId,
  getCognitoGroupForTier,
  validateWebhookAuth,
} from '../shared/revenueCatUtils';
import { TierName, COGNITO_GROUPS, getTierFromCognitoGroups, isUpgrade } from '../shared/tiers';
import { resetBillingAnchor } from '../shared/usage';

interface APIGatewayEvent {
  headers: Record<string, string | undefined>;
  body: string;
  isBase64Encoded?: boolean;
}

interface APIGatewayResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// Initialize AWS clients
const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Paid tier groups managed by this handler
const PAID_TIER_GROUPS = [
  COGNITO_GROUPS.PREMIUM,
  COGNITO_GROUPS.PLATINUM,
];

/**
 * Look up Cognito user by RevenueCat app_user_id
 * The app_user_id should match the Cognito user's sub (userId)
 */
async function findCognitoUser(
  appUserId: string,
  userPoolId: string
): Promise<string | null> {
  try {
    // The app_user_id is the Cognito sub, try to list the user directly
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `sub = "${appUserId}"`,
        Limit: 1,
      })
    );

    if (response.Users && response.Users.length > 0) {
      return response.Users[0].Username || null;
    }

    return null;
  } catch (error) {
    console.error('Error finding Cognito user:', error);
    return null;
  }
}

/**
 * Handle subscription activation (purchase, renewal, uncancellation)
 */
async function handleSubscriptionActivation(
  event: RevenueCatWebhookEvent['event'],
  userPoolId: string,
  subscriptionTableName: string,
  usageTableName: string | undefined
): Promise<void> {
  const { app_user_id, product_id, expiration_at_ms, purchased_at_ms, store, id, subscriber_attributes } = event;

  // Find Cognito user
  const username = await findCognitoUser(app_user_id, userPoolId);
  if (!username) {
    console.log(`User not found in Cognito: ${app_user_id}`);
    return;
  }

  // Determine tier from product
  const newTier = getTierFromProductId(product_id);
  if (!newTier) {
    console.error(`Unknown product ID: ${product_id}`);
    return;
  }

  console.log(`Activating subscription: user=${username}, tier=${newTier}, product=${product_id}`);

  // Get current groups
  const currentGroupsResponse = await cognitoClient.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    })
  );
  const currentGroups = currentGroupsResponse.Groups?.map(g => g.GroupName || '') || [];

  // Determine current tier before making changes
  const currentTier = getTierFromCognitoGroups(currentGroups);

  // Check if this is an upgrade - if so, reset billing anchor
  if (isUpgrade(currentTier, newTier) && usageTableName) {
    // Try to get timezone from RevenueCat subscriber attributes, fallback to UTC
    const timezone = subscriber_attributes?.['$timezone']?.value || 'UTC';
    console.log(`Upgrade detected (${currentTier} → ${newTier}), resetting billing anchor with timezone: ${timezone}`);

    try {
      await resetBillingAnchor(usageTableName, app_user_id, 'resident-ai', timezone, newTier);
      console.log('Billing anchor reset successfully');
    } catch (error) {
      console.error('Failed to reset billing anchor:', error);
      // Continue with subscription activation even if anchor reset fails
    }
  }

  // Remove from other paid tier groups
  const targetGroup = getCognitoGroupForTier(newTier);
  for (const group of PAID_TIER_GROUPS) {
    if (currentGroups.includes(group) && group !== targetGroup) {
      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username: username,
          GroupName: group,
        })
      );
      console.log(`Removed from group: ${group}`);
    }
  }

  // Remove from beta if subscribing
  if (currentGroups.includes(COGNITO_GROUPS.BETA)) {
    await cognitoClient.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: COGNITO_GROUPS.BETA,
      })
    );
    console.log('Removed from beta group');
  }

  // Add to target group
  if (!currentGroups.includes(targetGroup)) {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: targetGroup,
      })
    );
    console.log(`Added to group: ${targetGroup}`);
  }

  // Determine platform from store
  const platform = store === 'APP_STORE' ? 'ios' : store === 'PLAY_STORE' ? 'android' : undefined;

  // Update UserSubscription table
  const now = new Date().toISOString();

  // Fetch existing record to preserve createdAt
  let existingCreatedAt: string | undefined;
  try {
    const existingRecord = await docClient.send(
      new GetCommand({
        TableName: subscriptionTableName,
        Key: { userId: app_user_id },
      })
    );
    existingCreatedAt = existingRecord.Item?.createdAt;
  } catch (error) {
    // Record may not exist yet, that's fine
  }

  const subscriptionRecord: Record<string, unknown> = {
    userId: app_user_id,
    revenueCatAppUserId: app_user_id,
    productId: product_id,
    platform,
    tier: newTier,
    status: 'active',
    purchaseDate: new Date(purchased_at_ms).toISOString(),
    expiresDate: new Date(expiration_at_ms).toISOString(),
    lastEventId: id,
    lastSyncedAt: now,
    syncSource: 'webhook',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };

  // Check if migrating from beta
  if (currentGroups.includes(COGNITO_GROUPS.BETA)) {
    subscriptionRecord.migratedFromCognitoGroup = 'beta';
    subscriptionRecord.migrationDate = now;
  }

  // Filter out undefined values
  const filteredRecord = Object.fromEntries(
    Object.entries(subscriptionRecord).filter(([_, v]) => v !== undefined)
  );

  await docClient.send(
    new PutCommand({
      TableName: subscriptionTableName,
      Item: filteredRecord,
    })
  );

  console.log('UserSubscription updated');
}

/**
 * Handle subscription expiration
 */
async function handleSubscriptionExpiration(
  event: RevenueCatWebhookEvent['event'],
  userPoolId: string,
  subscriptionTableName: string
): Promise<void> {
  const { app_user_id, product_id, id } = event;

  // Find Cognito user
  const username = await findCognitoUser(app_user_id, userPoolId);
  if (!username) {
    console.log(`User not found in Cognito: ${app_user_id}`);
    return;
  }

  console.log(`Expiring subscription: user=${username}, product=${product_id}`);

  // Get current groups
  const currentGroupsResponse = await cognitoClient.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    })
  );
  const currentGroups = currentGroupsResponse.Groups?.map(g => g.GroupName || '') || [];

  // Remove from all paid tier groups
  for (const group of PAID_TIER_GROUPS) {
    if (currentGroups.includes(group)) {
      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username: username,
          GroupName: group,
        })
      );
      console.log(`Removed from group: ${group}`);
    }
  }

  // Update UserSubscription table
  const now = new Date().toISOString();

  // Fetch existing record to preserve createdAt
  let existingCreatedAt: string | undefined;
  try {
    const existingRecord = await docClient.send(
      new GetCommand({
        TableName: subscriptionTableName,
        Key: { userId: app_user_id },
      })
    );
    existingCreatedAt = existingRecord.Item?.createdAt;
  } catch (error) {
    // Record may not exist yet, that's fine
  }

  await docClient.send(
    new PutCommand({
      TableName: subscriptionTableName,
      Item: {
        userId: app_user_id,
        revenueCatAppUserId: app_user_id,
        productId: product_id,
        tier: 'basic',
        status: 'expired',
        lastEventId: id,
        lastSyncedAt: now,
        syncSource: 'webhook',
        createdAt: existingCreatedAt || now,
        updatedAt: now,
      },
    })
  );

  console.log('UserSubscription updated to expired');
}

/**
 * Handle billing issue (entering grace period)
 */
async function handleBillingIssue(
  event: RevenueCatWebhookEvent['event'],
  subscriptionTableName: string
): Promise<void> {
  const { app_user_id, product_id, id, grace_period_expiration_at_ms } = event;

  console.log(`Billing issue for user: ${app_user_id}`);

  // Get current subscription record
  const currentRecord = await docClient.send(
    new GetCommand({
      TableName: subscriptionTableName,
      Key: { userId: app_user_id },
    })
  );

  // Keep access during grace period but update status
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: subscriptionTableName,
      Item: {
        ...(currentRecord.Item || {}),
        userId: app_user_id,
        revenueCatAppUserId: app_user_id,
        productId: product_id,
        status: 'in_grace_period',
        expiresDate: grace_period_expiration_at_ms
          ? new Date(grace_period_expiration_at_ms).toISOString()
          : undefined,
        lastEventId: id,
        lastSyncedAt: now,
        syncSource: 'webhook',
        createdAt: currentRecord.Item?.createdAt || now,
        updatedAt: now,
      },
    })
  );

  console.log('UserSubscription updated to in_grace_period');
}

/**
 * Handle cancellation (user won't renew but still has access)
 */
async function handleCancellation(
  event: RevenueCatWebhookEvent['event'],
  subscriptionTableName: string
): Promise<void> {
  const { app_user_id, product_id, id, expiration_at_ms } = event;

  console.log(`Cancellation for user: ${app_user_id}`);

  // Get current subscription record
  const currentRecord = await docClient.send(
    new GetCommand({
      TableName: subscriptionTableName,
      Key: { userId: app_user_id },
    })
  );

  // Update status to canceled but keep tier (access until expiry)
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: subscriptionTableName,
      Item: {
        ...(currentRecord.Item || {}),
        userId: app_user_id,
        revenueCatAppUserId: app_user_id,
        productId: product_id,
        status: 'canceled',
        expiresDate: new Date(expiration_at_ms).toISOString(),
        lastEventId: id,
        lastSyncedAt: now,
        syncSource: 'webhook',
        createdAt: currentRecord.Item?.createdAt || now,
        updatedAt: now,
      },
    })
  );

  console.log('UserSubscription updated to canceled');
}

/**
 * Handle product change (upgrade/downgrade)
 */
async function handleProductChange(
  event: RevenueCatWebhookEvent['event'],
  userPoolId: string,
  subscriptionTableName: string,
  usageTableName: string | undefined
): Promise<void> {
  const { new_product_id } = event;

  if (!new_product_id) {
    console.error('PRODUCT_CHANGE event missing new_product_id');
    return;
  }

  // Treat as a new activation with the new product
  const modifiedEvent = {
    ...event,
    product_id: new_product_id,
  };

  await handleSubscriptionActivation(modifiedEvent, userPoolId, subscriptionTableName, usageTableName);
}

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayResponse> => {
  console.log('revenueCatWebhook invoked');

  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) {
    console.error('REVENUECAT_API_KEY not configured');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    console.error('COGNITO_USER_POOL_ID not configured');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  const subscriptionTableName = process.env.SUBSCRIPTION_TABLE_NAME;
  if (!subscriptionTableName) {
    console.error('SUBSCRIPTION_TABLE_NAME not configured');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  // Usage table is optional - if not configured, we skip billing anchor reset
  const usageTableName = process.env.USAGE_TABLE_NAME;
  if (!usageTableName) {
    console.warn('USAGE_TABLE_NAME not configured - billing anchor reset on upgrade will be skipped');
  }

  // Validate webhook authorization
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  if (!validateWebhookAuth(authHeader, apiKey)) {
    console.error('Invalid webhook authorization');
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  // Parse the webhook body
  let webhookData: RevenueCatWebhookEvent;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    webhookData = JSON.parse(body);
  } catch (error) {
    console.error('Failed to parse webhook body:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  const { event: rcEvent } = webhookData;
  const eventType = rcEvent.type as RevenueCatEventType;
  const eventId = rcEvent.id;

  console.log(`Processing event: ${eventType} (${eventId})`);

  // Check for idempotency - if we've already processed this event
  try {
    const existingRecord = await docClient.send(
      new GetCommand({
        TableName: subscriptionTableName,
        Key: { userId: rcEvent.app_user_id },
      })
    );

    if (existingRecord.Item?.lastEventId === eventId) {
      console.log(`Event ${eventId} already processed, skipping`);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Event already processed' }),
      };
    }
  } catch (error) {
    // Continue if we can't check - better to process twice than miss
    console.warn('Could not check for duplicate event:', error);
  }

  try {
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'SUBSCRIPTION_RESUMED':
        await handleSubscriptionActivation(rcEvent, userPoolId, subscriptionTableName, usageTableName);
        break;

      case 'EXPIRATION':
        await handleSubscriptionExpiration(rcEvent, userPoolId, subscriptionTableName);
        break;

      case 'BILLING_ISSUE':
        await handleBillingIssue(rcEvent, subscriptionTableName);
        break;

      case 'CANCELLATION':
      case 'SUBSCRIPTION_PAUSED':
        await handleCancellation(rcEvent, subscriptionTableName);
        break;

      case 'PRODUCT_CHANGE':
        await handleProductChange(rcEvent, userPoolId, subscriptionTableName, usageTableName);
        break;

      case 'TRANSFER':
      case 'SUBSCRIBER_ALIAS':
        // Log these but don't take action - user ID mapping handled by RevenueCat
        console.log(`Received ${eventType} event, no action required`);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event processed successfully' }),
    };
  } catch (error) {
    console.error('Error processing webhook event:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
