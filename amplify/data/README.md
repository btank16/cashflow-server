# Data Layer — GraphQL Schema & DynamoDB Models

Defined in `resource.ts`. This file contains all GraphQL operations (queries/mutations) and DynamoDB table definitions for the Cashflow backend.

The default authorization mode is **Cognito User Pool** (`userPool`).

## GraphQL Operations

### Rental Workflow (Async)

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `startRentalWorkflow` | Mutation | Authenticated | Start async property analysis. Returns `jobId` for polling. |
| `getRentalWorkflowStatus` | Query | Authenticated | Poll job status by `jobId`. Returns progress, result, and errors. |
| `newRentalWorkflow` | Query | Authenticated | Legacy synchronous workflow (backwards compatibility). |

**startRentalWorkflow input:**
```graphql
street: String!    # Street address
city: String!      # City name
state: String!     # State abbreviation
zip: String!       # 5-digit ZIP
timezone: String   # For billing period calculation (default: UTC)
config: AWSJSON    # Optional workflow config overrides
```

**getRentalWorkflowStatus response:**
```graphql
jobId: String
status: String          # pending | processing | completed | failed | not_found
currentStep: String     # Current workflow step name
completedSteps: AWSJSON # Array of completed step names
result: AWSJSON         # Full property analysis (when completed)
metadata: AWSJSON       # Execution metrics (API calls, timing)
error: String           # Error message (when failed)
```

### Entitlements & Usage

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `getMyEntitlements` | Query | Authenticated | Returns user's tier, usage, features, and limits. |

**Response:**
```graphql
tier: String!              # basic | beta | premium | platinum | admin
displayName: String!       # Human-readable tier name
monthlyLimit: Int          # null = unlimited
monthlyUsed: Int!          # Usage in current billing period
monthlyRemaining: Int      # null = unlimited
periodStart: String!       # Billing period start (YYYY-MM-DD)
periodEnd: String!         # Billing period end (YYYY-MM-DD)
features: [String!]!       # Feature flags (e.g., "resident-ai", "offer-letter")
canUseResidentAI: Boolean! # Shorthand for resident-ai access
isAdmin: Boolean!
source: String!            # "subscription" or "cognito-group"
```

### AI Features

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `geminiArticles` | Query | Authenticated | Generate educational article with 3 questions via Gemini |
| `generateOfferLetter` | Mutation | Authenticated | Generate real estate offer letter via Gemini |
| `lookupInterestRate` | Query | Authenticated | Look up current mortgage rates via Perplexity |

**generateOfferLetter input:**
```graphql
offerType: String!       # "rental", "flip", or "brrrr"
receiver: String!        # "homeowner", "lender", "realtor", or "investor"
inputData: AWSJSON!      # Calculator data (varies by offer type)
senderFirstName: String  # Optional: for letter signature
senderLastName: String   # Optional: for letter signature
```

**lookupInterestRate input:**
```graphql
loanType: String!       # e.g., "30-year fixed"
isPersonal: Boolean!    # true = primary residence, false = investment property
downPayment: Int!       # 5, 10, 15, or 20
state: String!          # e.g., "Ohio"
```

### Subscription Management

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `syncSubscription` | Mutation | Authenticated | Verify and sync RevenueCat subscription state |

Called by the client after in-app purchases to ensure server-side state matches RevenueCat. See [functions/revenueCatWebhook/README.md](../functions/revenueCatWebhook/README.md) for the full subscription lifecycle.

### Admin Operations

| Operation | Type | Auth | Description |
|-----------|------|------|-------------|
| `grantBetaAccess` | Mutation | `admin` group | Add user to beta group by email |
| `revokeBetaAccess` | Mutation | `admin` group | Remove user from beta group by email |
| `listBetaUsers` | Query | `admin` group | List all beta testers |

These operations require the calling user to be in the `admin` Cognito group.

## DynamoDB Models

### WorkflowJob

Tracks async rental workflow jobs. Created by `startRentalWorkflow`, updated by `newRentalWorkflow`, read by `getRentalWorkflowStatus`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | ID (PK) | Auto-generated UUID |
| `owner` | String | Cognito user ID (for owner-based auth) |
| `status` | Enum | `pending`, `processing`, `completed`, `failed` |
| `current_step` | String | Name of the currently executing step |
| `completed_steps` | JSON | Array of completed step names (stored as JSON string) |
| `input` | JSON | Original request (address + config) |
| `result` | JSON | Full property analysis output |
| `metadata` | JSON | Execution metrics |
| `error` | String | Error message on failure |

**Authorization:** Owner-only (user can only read/write their own jobs).

### UserSubscription

RevenueCat subscription state managed by `revenueCatWebhook` and `syncSubscription`.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | ID (PK) | Cognito user ID |
| `revenueCatAppUserId` | String | RevenueCat app user ID |
| `productId` | String | RevenueCat product (e.g., `investor_annual`) |
| `platform` | Enum | `ios`, `android` |
| `tier` | Enum | `basic`, `beta`, `premium`, `platinum`, `admin` |
| `status` | Enum | `active`, `expired`, `in_grace_period`, `paused`, `canceled`, `trialing`, `legacy` |
| `purchaseDate` | DateTime | Subscription purchase date |
| `expiresDate` | DateTime | Current period expiration |
| `lastEventId` | String | Last processed webhook event (idempotency) |
| `lastSyncedAt` | DateTime | Last sync timestamp |
| `syncSource` | Enum | `webhook`, `client`, `admin` |

**Authorization:** Owner can read only. Lambda functions write via IAM.

### UsageRecord

Billing-cycle usage tracking. Accessed directly via DynamoDB SDK by Lambda functions.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String (PK) | Cognito user ID |
| `periodFunction` | String (SK) | Composite key — see formats below |
| `count` | Integer | Usage count in current period |
| `tier` | String | Tier snapshot at usage time |
| `ttl` | Integer | Auto-cleanup (40-day TTL) |

**Sort key formats:**
- `anchor#<timezone>#<functionName>` — Stores the user's billing anchor day
- `billing#<YYYY-MM-DD>#<timezone>#<functionName>` — Stores period usage count

See [functions/shared/README.md](../functions/shared/README.md) for billing cycle details.

### RateLimitCounter

Distributed rate limiting across concurrent Lambda invocations. Used by `newRentalWorkflow` to coordinate API call rates for Rentcast, Overpass, and geocoding.

| Field | Type | Description |
|-------|------|-------------|
| `service` | String (PK) | Service name (e.g., `rentcast`, `overpass`) |
| `window` | String (SK) | Unix timestamp of the rate limit window |
| `request_count` | Integer | Requests in this window |
| `ttl` | Integer | Auto-cleanup (60 seconds after window) |

### Calculation

User-saved calculator results from the mobile app.

| Field | Type | Description |
|-------|------|-------------|
| `id` | ID (PK) | Auto-generated |
| `user_id` | String (GSI) | Cognito user ID |
| `calculator_type` | String | Calculator name (e.g., BRRRR, Flip) |
| `input_values` | String | JSON-encoded calculator inputs |
| `results` | String | JSON-encoded calculation results |

**Authorization:** Owner-only. Has a secondary index on `user_id` for listing a user's calculations.

### Expense

User-saved expense items for calculator pre-fill.

| Field | Type | Description |
|-------|------|-------------|
| `id` | ID (PK) | Auto-generated |
| `user_id` | String (GSI) | Cognito user ID |
| `category` | String | Expense category |
| `cost` | String | Dollar amount |
| `frequency` | String | Payment frequency |
| `applicable_calculators` | String | Which calculators this expense applies to |

**Authorization:** Owner-only. Has a secondary index on `user_id`.

## Data Access Patterns

### AppSync Resolvers (client-facing)
Most operations are defined as AppSync queries/mutations with Lambda function handlers. The client uses the generated Amplify GraphQL client to call them.

### Direct DynamoDB Access (Lambda-to-Lambda)
Several tables are accessed directly via DynamoDB SDK rather than through AppSync:
- `UsageRecord` — Read/write by `startRentalWorkflow`, `getEntitlements`, `syncSubscription`, `revenueCatWebhook`
- `UserSubscription` — Read/write by `revenueCatWebhook`, `syncSubscription`; read by `getEntitlements`, `startRentalWorkflow`
- `RateLimitCounter` — Read/write by `newRentalWorkflow`
- `WorkflowJob` — Read/write by `newRentalWorkflow`; write by `startRentalWorkflow`; read by `getRentalWorkflowStatus`

IAM permissions for direct access are configured in [`backend.ts`](../backend.ts).

## Notes for Developers

- **JSON fields** (`a.json()`) are stored as JSON strings in DynamoDB. Lambda handlers must `JSON.stringify()` when writing and `JSON.parse()` when reading.
- **Owner authorization** uses the Cognito `sub` claim. The `owner` field is automatically managed by Amplify for models using `allow.owner()`.
- **Custom identifiers** (e.g., `UsageRecord`, `RateLimitCounter`) require explicit `createdAt`/`updatedAt` fields since Amplify doesn't auto-manage timestamps for non-default keys.
- **Admin operations** use `allow.group('admin')` — only users in the `admin` Cognito group can call them.
