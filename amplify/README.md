# Cashflow Server — AWS Amplify Backend

This is the backend infrastructure for the Cashflow real estate investment app. It runs on AWS Amplify Gen 2 and is defined entirely as TypeScript infrastructure-as-code.

## Directory Structure

```
amplify/
  backend.ts              # Main infrastructure config (permissions, env vars, API Gateway)
  auth/                   # Cognito authentication and user groups
    resource.ts           # Auth config (email, Google, Apple Sign-In)
    post-confirmation/    # Lambda trigger: assigns new users to 'basic' group
  data/                   # GraphQL schema and DynamoDB models
    resource.ts           # Schema definition (queries, mutations, models)
  functions/              # Lambda functions (14 total)
    shared/               # Shared TypeScript utilities (auth, tiers, usage, RevenueCat)
    propertyDataGather/   # Python module for property data functions (40+)
    ...                   # Individual Lambda function directories
  storage/                # S3 storage configuration
    resource.ts           # Temp PDF storage with 1-day lifecycle
```

See [functions/README.md](./functions/README.md) for the full function index and architecture diagrams.

## AWS Services Used

| Service | Purpose |
|---------|---------|
| **AppSync** (GraphQL) | API layer for all client-facing operations |
| **Cognito** | Authentication (email + Google + Apple) and group-based authorization |
| **DynamoDB** | Data storage (6 tables), usage tracking, rate limiting |
| **Lambda** | 14 functions (13 TypeScript, 1 Python) |
| **API Gateway** | REST endpoint for RevenueCat webhook |
| **S3** | Temporary PDF storage (1-day auto-expiry) |
| **SSM Parameter Store** | Encrypted API key storage for Python functions |

## Authentication (`auth/`)

Configured in `auth/resource.ts`. Users can sign in with:

- **Email/password** — primary method
- **Google** — OAuth with `email`, `profile`, `openid` scopes
- **Apple Sign-In** — OAuth with `email`, `name` scopes

### User Groups (Cognito)

| Group | Purpose |
|-------|---------|
| `basic` | Default group, assigned on signup via post-confirmation trigger |
| `beta` | Beta testers, managed by admin functions |
| `premium` | Paid tier (RevenueCat "Investor" products) |
| `platinum` | Paid tier (RevenueCat "Mogul" products) |
| `admin` | Full access, manages beta users |

See [functions/shared/README.md](./functions/shared/README.md) for tier details and feature flags.

### Custom User Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `custom:origin_state` | String | User's home state |
| `custom:interest_state` | String | State of investment interest |
| `custom:terms` | Boolean | Terms acceptance |
| `custom:email_updates` | Boolean | Email opt-in |
| `custom:invest_strategy` | String | Preferred investment strategy |
| `custom:referral_code` | String | Referral tracking |

### Post-Confirmation Trigger

`auth/post-confirmation/handler.ts` — Automatically adds every new user to the `basic` Cognito group immediately after email confirmation. This ensures all users have a baseline tier before they can access the app.

## Data Layer (`data/`)

Defined in `data/resource.ts`. See [data/README.md](./data/README.md) for full schema documentation.

### GraphQL Operations

**Mutations:**
- `startRentalWorkflow` — Kick off async property analysis
- `generateOfferLetter` — Generate AI offer letter
- `syncSubscription` — Verify RevenueCat subscription
- `grantBetaAccess` / `revokeBetaAccess` — Admin beta management

**Queries:**
- `getRentalWorkflowStatus` — Poll async job progress
- `getMyEntitlements` — Get user's tier, usage, and features
- `geminiArticles` — Generate educational content
- `lookupInterestRate` — Current mortgage rate lookup
- `listBetaUsers` — Admin: list beta testers
- `newRentalWorkflow` — Legacy synchronous workflow (kept for backwards compatibility)

### DynamoDB Tables

| Table | Key | Purpose |
|-------|-----|---------|
| `WorkflowJob` | `id` (PK) | Async job tracking for rental workflow |
| `UserSubscription` | `userId` (PK) | RevenueCat subscription state |
| `UsageRecord` | `userId` (PK), `periodFunction` (SK) | Billing-cycle usage tracking |
| `RateLimitCounter` | `service` (PK), `window` (SK) | Distributed API rate limiting |
| `Calculation` | `id` (PK), GSI on `user_id` | Saved calculator results |
| `Expense` | `id` (PK), GSI on `user_id` | Saved expense items |

`RateLimitCounter` and `UsageRecord` have TTL enabled for automatic cleanup.

## Functions (`functions/`)

See [functions/README.md](./functions/README.md) for the complete function index, architecture diagrams, and system flow documentation.

Key sub-documentation:
- [functions/shared/README.md](./functions/shared/README.md) — Authorization, tiers, usage tracking, RevenueCat utilities
- [functions/propertyDataGather/README.md](./functions/propertyDataGather/README.md) — Python property data module (40+ functions)
- [functions/newRentalWorkflow/README.md](./functions/newRentalWorkflow/README.md) — Async workflow orchestrator
- [functions/revenueCatWebhook/README.md](./functions/revenueCatWebhook/README.md) — Subscription lifecycle webhook

## Storage (`storage/`)

S3 bucket (`tempPdfStorage`) for temporary PDF files:
- Path: `pdfs/*`
- Access: All authenticated users and group members (read/write/delete)
- **Lifecycle**: Objects auto-deleted after **1 day** (configured in `backend.ts`)

## Infrastructure Config (`backend.ts`)

The main configuration file that wires everything together:

1. **Registers** all resources (auth, data, storage, 14 Lambda functions)
2. **Configures DynamoDB TTL** on `RateLimitCounter` and `UsageRecord` tables
3. **Sets environment variables** on each Lambda (table names, Cognito pool ID, API keys)
4. **Grants IAM permissions** — DynamoDB access, Cognito group management, Lambda invocation
5. **Creates API Gateway** REST endpoint for RevenueCat webhook
6. **Configures S3 lifecycle** rule for temp PDF cleanup
7. **Outputs** the webhook URL for RevenueCat dashboard configuration

## Deployment

```bash
# Local development sandbox (hot-reloads on changes)
npx ampx sandbox

# Deploy to production
npx ampx deploy

# Generate GraphQL client types
npx ampx generate graphql-client-code
```

After deployment, configure the output `revenueCatWebhookUrl` in the RevenueCat dashboard under Webhooks.

## External Service Dependencies

| Service | Used By | Key Storage |
|---------|---------|-------------|
| RevenueCat | revenueCatWebhook, syncSubscription | Env var: `REVENUECAT_API_KEY` |
| Google Gemini | geminiArticles, offerLetter, newRentalWorkflow | Env var / SSM Parameter Store |
| Perplexity | interestRateLookup, newRentalWorkflow | Env var / SSM Parameter Store |
| Rentcast | newRentalWorkflow | SSM Parameter Store |
| Google Address Validation | newRentalWorkflow | SSM Parameter Store |
| OpenStreetMap Overpass | newRentalWorkflow | Public (rate-limited) |

TypeScript functions use environment variables directly. Python functions (newRentalWorkflow) retrieve keys from SSM Parameter Store with 5-minute caching.
