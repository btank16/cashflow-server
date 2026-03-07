# Shared Utilities

TypeScript utilities shared across all Lambda functions. Handles authorization, tier configuration, usage tracking, and RevenueCat integration.

## Files

| File | Purpose |
|------|---------|
| `authorization.ts` | Entitlement resolution, access control, identity extraction |
| `tiers.ts` | Tier definitions, feature flags, Cognito group constants |
| `usage.ts` | Billing-cycle-aware usage tracking with DynamoDB |
| `revenueCatUtils.ts` | RevenueCat API client, product-to-tier mapping, webhook validation |

## Authorization (`authorization.ts`)

### Entitlement Resolution

Entitlements are resolved in priority order:

1. **UserSubscription table** (DynamoDB) - Checked first for RevenueCat-managed subscriptions
2. **Cognito groups** - Fallback for beta/admin users or users without a subscription record

```typescript
// Async version (checks DynamoDB first, then Cognito groups)
const entitlements = await getUserEntitlementsAsync(userId, cognitoGroups);

// Sync version (Cognito groups only, for simple checks)
const entitlements = getUserEntitlements(cognitoGroups);
```

### Key Exports

| Function | Description |
|----------|-------------|
| `getUserEntitlementsAsync()` | Full entitlement check (DynamoDB + Cognito fallback) |
| `getUserEntitlements()` | Sync entitlement check (Cognito groups only) |
| `checkResidentAIAccess()` | Check if user can access resident-AI feature |
| `extractCognitoGroups()` | Parse groups from Lambda event identity |
| `extractUserId()` | Parse user ID from Lambda event identity |
| `isAdmin()` | Check admin group membership |
| `getActiveSubscription()` | Fetch active subscription from DynamoDB |

### UserEntitlements Interface

```typescript
interface UserEntitlements {
  tier: TierName;            // 'basic' | 'beta' | 'premium' | 'platinum' | 'admin'
  displayName: string;       // Human-readable tier name
  monthlyLimit: number | null; // null = unlimited
  features: string[];        // Feature flags the user has access to
  source: 'cognito-group' | 'subscription';
  isAdmin: boolean;
}
```

## Tier Configuration (`tiers.ts`)

### Tiers

| Tier | Display Name | Monthly Limit | Key Features |
|------|-------------|---------------|--------------|
| `basic` | Free | 3 | resident-ai, calculation-database, interest-rate-lookup |
| `beta` | Beta Tester | 50 | All features (testing) |
| `premium` | Premium | 50 | resident-ai, databases, gemini-articles, interest-rate-lookup |
| `platinum` | Platinum | 200 | All features including offer-letter and branded-pdf |
| `admin` | Admin | Unlimited | All features |

### Feature Flags

```typescript
const FEATURES = {
  RESIDENT_AI: 'resident-ai',
  CALCULATION_DATABASE: 'calculation-database',
  EXPENSE_DATABASE: 'expense-database',
  GEMINI_ARTICLES: 'gemini-articles',
  INTEREST_RATE_LOOKUP: 'interest-rate-lookup',
  OFFER_LETTER: 'offer-letter',
  BRANDED_PDF: 'branded-pdf',
};
```

### Key Exports

| Function | Description |
|----------|-------------|
| `getTierFromCognitoGroups()` | Resolve tier from group list (highest wins) |
| `tierHasFeature()` | Check if a tier includes a feature |
| `isUpgrade()` / `isDowngrade()` | Compare tier ranks for subscription changes |
| `COGNITO_GROUPS` | Group name constants (`basic`, `beta`, `premium`, `platinum`, `admin`) |

## Usage Tracking (`usage.ts`)

### Billing Cycle Model

Usage is tracked per **billing period**, not per calendar month. Each user's billing cycle is anchored to the day they first used the feature:

- User first uses resident-AI on **Jan 15** -> billing periods run 15th to 14th
- Anchor is stored in DynamoDB and persists across months
- Handles month-length edge cases (e.g., anchor day 31 in February -> uses 28th/29th)
- Anchor resets on tier upgrade (user gets a fresh billing period)

### DynamoDB Key Structure

```
UsageRecord table:
  PK: userId
  SK: "anchor#timezone#functionName"      -> stores anchor day
  SK: "billing#2025-01-15#UTC#resident-ai" -> stores period usage count
```

Records have a 40-day TTL for automatic cleanup.

### Key Exports

| Function | Description |
|----------|-------------|
| `checkAndIncrementUsage()` | Atomic check + increment (prevents race conditions via DynamoDB conditional update) |
| `getUsageStatus()` | Get current usage without incrementing |
| `resetBillingAnchor()` | Reset anchor to today (called on tier upgrade) |

### UsageStatus Interface

```typescript
interface UsageStatus {
  monthlyUsed: number;
  monthlyLimit: number | null;  // null = unlimited
  monthlyRemaining: number | null;
  periodStart: string;          // YYYY-MM-DD
  periodEnd: string;            // YYYY-MM-DD
  canProceed: boolean;
  limitReached: boolean;
}
```

## RevenueCat Integration (`revenueCatUtils.ts`)

### Product-to-Tier Mapping

| Product ID | Platform | Tier |
|------------|----------|------|
| `investor_monthly` / `investor_annual` | iOS | premium |
| `mogul_monthly` / `mogul_annual` | iOS | platinum |
| `investor_tier:investormonthly` / `:investorannual` | Android | premium |
| `mogul_tier:mogulmonthly` / `:mogulannual` | Android | platinum |

Test products (`*_test`) also map to their respective tiers.

### Key Exports

| Function | Description |
|----------|-------------|
| `getTierFromProductId()` | Map RevenueCat product ID to internal tier |
| `getCognitoGroupForTier()` | Map tier to Cognito group name |
| `getSubscriptionStatus()` | Parse active subscription from RevenueCat subscriber data |
| `fetchRevenueCatSubscriber()` | Call RevenueCat Subscriber API |
| `validateWebhookAuth()` | Validate `Authorization: Bearer <key>` header |

### Webhook Event Types

Handled: `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `UNCANCELLATION`, `EXPIRATION`, `PRODUCT_CHANGE`, `BILLING_ISSUE`, `TRANSFER`, `SUBSCRIBER_ALIAS`, `SUBSCRIPTION_PAUSED`, `SUBSCRIPTION_RESUMED`
