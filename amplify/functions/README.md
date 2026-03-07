# Lambda Functions Overview

This directory contains all Lambda functions powering the Cashflow backend. The backend runs on AWS Amplify with AppSync (GraphQL), DynamoDB, Cognito, and S3.

## Architecture

```
Client (React Native)
    |
    v
AppSync GraphQL API
    |
    +---> startRentalWorkflow -----> newRentalWorkflow (async, Python)
    |         |                            |
    |         v                            v
    |    WorkflowJob table           propertyDataGather module
    |         ^                      (40+ sub-functions)
    |         |
    +---> getRentalWorkflowStatus
    |
    +---> getEntitlements
    |         |
    |         v
    |    UserSubscription table / Cognito groups
    |
    +---> geminiArticles
    +---> interestRateLookup
    +---> offerLetter
    +---> syncSubscription
    +---> grantBetaAccess / revokeBetaAccess / listBetaUsers

RevenueCat (webhook)
    |
    v
API Gateway REST endpoint ---> revenueCatWebhook
```

## Function Index

| Function | Language | Trigger | Description |
|----------|----------|---------|-------------|
| [newRentalWorkflow](./newRentalWorkflow/) | Python | Async Lambda invoke | Multi-step property data gathering workflow |
| [startRentalWorkflow](./startRentalWorkflow/) | TypeScript | AppSync resolver | Validates access, creates job, invokes workflow |
| [getRentalWorkflowStatus](./getRentalWorkflowStatus/) | TypeScript | AppSync resolver | Polls async workflow job status |
| [getEntitlements](./getEntitlements/) | TypeScript | AppSync resolver | Returns user tier, limits, and feature access |
| [revenueCatWebhook](./revenueCatWebhook/) | TypeScript | API Gateway REST | Handles subscription lifecycle events |
| [syncSubscription](./syncSubscription/) | TypeScript | AppSync resolver | Client-side subscription verification |
| [geminiArticles](./geminiArticles/) | TypeScript | AppSync resolver | Generates educational article content via Gemini |
| [interestRateLookup](./interestRateLookup/) | TypeScript | AppSync resolver | Looks up current mortgage rates via Perplexity |
| [offerLetter](./offerLetter/) | TypeScript | AppSync resolver | Generates real estate offer letters via Gemini |
| [grantBetaAccess](./grantBetaAccess/) | TypeScript | AppSync resolver | Admin: adds user to beta group |
| [revokeBetaAccess](./revokeBetaAccess/) | TypeScript | AppSync resolver | Admin: removes user from beta group |
| [listBetaUsers](./listBetaUsers/) | TypeScript | AppSync resolver | Admin: lists all beta testers |

**Auth trigger:** [post-confirmation](../auth/post-confirmation/) assigns new users to the `basic` Cognito group on signup.

## Shared Modules

| Module | Description |
|--------|-------------|
| [shared/](./shared/) | Authorization, tier config, usage tracking, RevenueCat utilities |
| [propertyDataGather/](./propertyDataGather/) | Python module with 40+ property data functions used by newRentalWorkflow |

## Key System Flows

### Subscription Lifecycle
1. User purchases in-app -> RevenueCat sends webhook -> `revenueCatWebhook` updates Cognito groups + `UserSubscription` table
2. Client calls `syncSubscription` post-purchase to verify state
3. All feature-gated functions call `getEntitlements` to check tier/usage

### Resident-AI Property Analysis
1. Client calls `startRentalWorkflow` with address
2. Function validates auth, checks feature access, checks usage limits, increments usage counter
3. Creates `WorkflowJob` record (status: `pending`), invokes `newRentalWorkflow` asynchronously
4. `newRentalWorkflow` orchestrates 40+ sub-functions with parallel execution, updates job progress
5. Client polls `getRentalWorkflowStatus` until status is `completed` or `failed`

### Tier Resolution (priority order)
1. Check `UserSubscription` DynamoDB table (RevenueCat subscriptions)
2. Fall back to Cognito group membership (beta/admin users)
3. Default to `basic` tier

## DynamoDB Tables

| Table | Purpose | Key |
|-------|---------|-----|
| WorkflowJob | Async job tracking | `id` (PK) |
| UserSubscription | RevenueCat subscription state | `userId` (PK) |
| UsageRecord | Billing-cycle usage tracking | `userId` (PK), `periodFunction` (SK) |
| RateLimitCounter | Distributed rate limiting | `key` (PK), `period` (SK) |

## Environment Variables

Shared variables configured in `backend.ts`:

| Variable | Used By | Description |
|----------|---------|-------------|
| `COGNITO_USER_POOL_ID` | revenueCatWebhook, syncSubscription, beta functions | Cognito user pool |
| `REVENUECAT_API_KEY` | revenueCatWebhook, syncSubscription | RevenueCat API key |
| `SUBSCRIPTION_TABLE_NAME` | revenueCatWebhook, syncSubscription, getEntitlements | UserSubscription table |
| `USAGE_TABLE_NAME` | startRentalWorkflow, getEntitlements | UsageRecord table |
| `WORKFLOW_JOB_TABLE_NAME` | startRentalWorkflow, getRentalWorkflowStatus, newRentalWorkflow | WorkflowJob table |
| `WORKFLOW_LAMBDA_NAME` | startRentalWorkflow | Name of newRentalWorkflow Lambda |
| `GEMINI_API_KEY` | geminiArticles, offerLetter | Google Gemini API key |
| `PERPLEXITY_API_KEY` | interestRateLookup | Perplexity API key |

Python functions (newRentalWorkflow) retrieve API keys from **SSM Parameter Store** rather than environment variables.

## Deployment

The backend is deployed via AWS Amplify. All infrastructure is defined in [`backend.ts`](../backend.ts).

```bash
# Deploy from the project root
npx ampx sandbox     # Local development sandbox
npx ampx deploy      # Production deployment
```
