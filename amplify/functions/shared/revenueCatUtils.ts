/**
 * RevenueCat Utilities
 *
 * Shared utilities for RevenueCat integration including API client,
 * product-to-tier mapping, and subscription status helpers.
 */

import { TierName, COGNITO_GROUPS } from './tiers';

/**
 * Product ID to Tier Mapping
 * Maps RevenueCat product identifiers to internal tier names
 */
export const PRODUCT_TO_TIER: Record<string, TierName> = {
  // iOS production products
  'investor_annual': 'premium',
  'investor_monthly': 'premium',
  'mogul_annual': 'platinum',
  'mogul_monthly': 'platinum',
  // iOS test products
  'investor_annual_test': 'premium',
  'investor_monthly_test': 'premium',
  'mogul_annual_test': 'platinum',
  'mogul_monthly_test': 'platinum',
  // Android products (using offering:product format)
  'investor_tier:investorannual': 'premium',
  'investor_tier:investormonthly': 'premium',
  'mogul_tier:mogulannual': 'platinum',
  'mogul_tier:mogulmonthly': 'platinum',
};

/**
 * Tier to Cognito Group Mapping
 */
export const TIER_TO_COGNITO_GROUP: Record<TierName, string> = {
  basic: COGNITO_GROUPS.BASIC,
  beta: COGNITO_GROUPS.BETA,
  premium: COGNITO_GROUPS.PREMIUM,
  platinum: COGNITO_GROUPS.PLATINUM,
  admin: COGNITO_GROUPS.ADMIN,
};

/**
 * RevenueCat subscription status values
 */
export type RevenueCatSubscriptionStatus =
  | 'active'
  | 'expired'
  | 'in_grace_period'
  | 'paused'
  | 'canceled'
  | 'trialing';

/**
 * RevenueCat webhook event types
 */
export type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'EXPIRATION'
  | 'PRODUCT_CHANGE'
  | 'BILLING_ISSUE'
  | 'SUBSCRIBER_ALIAS'
  | 'SUBSCRIPTION_PAUSED'
  | 'SUBSCRIPTION_RESUMED'
  | 'TRANSFER';

/**
 * RevenueCat webhook event structure
 */
export interface RevenueCatWebhookEvent {
  api_version: string;
  event: {
    id: string;
    type: RevenueCatEventType;
    app_user_id: string;
    original_app_user_id: string;
    aliases: string[];
    product_id: string;
    period_type: string;
    purchased_at_ms: number;
    expiration_at_ms: number;
    environment: 'SANDBOX' | 'PRODUCTION';
    entitlement_id?: string;
    entitlement_ids?: string[];
    presented_offering_id?: string;
    transaction_id?: string;
    original_transaction_id?: string;
    store: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL';
    is_family_share?: boolean;
    transferred_from?: string[];
    transferred_to?: string[];
    new_product_id?: string;
    cancel_reason?: string;
    grace_period_expiration_at_ms?: number;
    auto_resume_at_ms?: number;
    price?: number;
    currency?: string;
    subscriber_attributes?: Record<string, { value: string; updated_at_ms: number }>;
  };
}

/**
 * RevenueCat Subscriber API response structure
 */
export interface RevenueCatSubscriberInfo {
  request_date: string;
  request_date_ms: number;
  subscriber: {
    original_app_user_id: string;
    original_application_version: string;
    original_purchase_date: string;
    management_url: string | null;
    first_seen: string;
    last_seen: string;
    entitlements: Record<string, {
      expires_date: string | null;
      grace_period_expires_date: string | null;
      product_identifier: string;
      purchase_date: string;
    }>;
    subscriptions: Record<string, {
      expires_date: string;
      grace_period_expires_date: string | null;
      purchase_date: string;
      original_purchase_date: string;
      period_type: string;
      store: string;
      is_sandbox: boolean;
      unsubscribe_detected_at: string | null;
      billing_issues_detected_at: string | null;
      ownership_type: string;
      auto_resume_date: string | null;
    }>;
    non_subscriptions: Record<string, unknown[]>;
    subscriber_attributes?: Record<string, { value: string; updated_at_ms: number }>;
  };
}

/**
 * Get tier from product ID
 */
export function getTierFromProductId(productId: string): TierName | null {
  return PRODUCT_TO_TIER[productId] || null;
}

/**
 * Get Cognito group for a tier
 */
export function getCognitoGroupForTier(tier: TierName): string {
  return TIER_TO_COGNITO_GROUP[tier];
}

/**
 * Determine subscription status from RevenueCat subscriber info
 */
export function getSubscriptionStatus(
  subscriptions: RevenueCatSubscriberInfo['subscriber']['subscriptions']
): { status: RevenueCatSubscriptionStatus; productId: string | null; expiresDate: Date | null } {
  // Find the active subscription with the latest expiration
  let latestExpiration: Date | null = null;
  let activeProductId: string | null = null;
  let status: RevenueCatSubscriptionStatus = 'expired';

  const now = new Date();

  for (const [productId, subscription] of Object.entries(subscriptions)) {
    const expiresDate = new Date(subscription.expires_date);
    const gracePeriodExpires = subscription.grace_period_expires_date
      ? new Date(subscription.grace_period_expires_date)
      : null;

    // Check if subscription is in grace period
    if (gracePeriodExpires && gracePeriodExpires > now) {
      if (!latestExpiration || expiresDate > latestExpiration) {
        latestExpiration = expiresDate;
        activeProductId = productId;
        status = 'in_grace_period';
      }
      continue;
    }

    // Check if subscription is active
    if (expiresDate > now) {
      if (!latestExpiration || expiresDate > latestExpiration) {
        latestExpiration = expiresDate;
        activeProductId = productId;

        // Determine specific status
        if (subscription.unsubscribe_detected_at) {
          status = 'canceled';  // Will not renew but still has access
        } else if (subscription.auto_resume_date) {
          status = 'paused';
        } else {
          status = 'active';
        }
      }
    }
  }

  return {
    status,
    productId: activeProductId,
    expiresDate: latestExpiration,
  };
}

/**
 * Fetch subscriber info from RevenueCat API
 */
export async function fetchRevenueCatSubscriber(
  appUserId: string,
  apiKey: string
): Promise<RevenueCatSubscriberInfo> {
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RevenueCat API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Validate RevenueCat webhook authorization header
 * RevenueCat sends the API key in the Authorization header
 */
export function validateWebhookAuth(authHeader: string | undefined, apiKey: string): boolean {
  if (!authHeader) return false;

  // RevenueCat sends "Bearer <api_key>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false;

  return parts[1] === apiKey;
}
