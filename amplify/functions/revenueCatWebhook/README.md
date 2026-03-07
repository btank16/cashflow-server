# revenueCatWebhook

Handles subscription lifecycle events from RevenueCat. This is the primary server-side mechanism for keeping user subscription state in sync with in-app purchases.

## Trigger

**API Gateway REST endpoint** — RevenueCat sends POST requests to this endpoint when subscription events occur. The webhook URL is configured in the RevenueCat dashboard and output by `backend.ts` during deployment.

## Input

RevenueCat webhook payload (POST body):

```json
{
  "api_version": "1.0",
  "event": {
    "id": "event-uuid",
    "type": "INITIAL_PURCHASE",
    "app_user_id": "cognito-sub-uuid",
    "product_id": "investor_monthly",
    "purchased_at_ms": 1700000000000,
    "expiration_at_ms": 1702592000000,
    "environment": "PRODUCTION",
    "store": "APP_STORE",
    "subscriber_attributes": { ... }
  }
}
```

Authentication: `Authorization: Bearer <REVENUECAT_API_KEY>` header validated against the stored API key.

## Output

```json
{
  "statusCode": 200,
  "body": "{\"message\": \"Event processed successfully\"}"
}
```

Returns 200 for all successfully processed events (including ignored/duplicate events) to prevent RevenueCat retries.

## Event Handling

| Event Type | Action |
|------------|--------|
| `INITIAL_PURCHASE` | Add user to tier Cognito group, create/update UserSubscription record, reset billing anchor if upgrade |
| `RENEWAL` | Same as INITIAL_PURCHASE (re-confirms active subscription) |
| `UNCANCELLATION` | Same as INITIAL_PURCHASE (user re-enabled auto-renew) |
| `CANCELLATION` | Mark subscription as `canceled` (user still has access until expiry) |
| `EXPIRATION` | Remove user from paid tier Cognito group, mark subscription as `expired` |
| `PRODUCT_CHANGE` | Treat as new activation with the new product ID |
| `BILLING_ISSUE` | Mark subscription as `in_grace_period` |
| `TRANSFER` | Log only (user transferred subscription between accounts) |
| `SUBSCRIBER_ALIAS` | Ignored |
| `SUBSCRIPTION_PAUSED` | Ignored |
| `SUBSCRIPTION_RESUMED` | Treated as activation |

## Key Logic

### Subscription Activation Flow
1. Validate webhook auth header
2. Check for duplicate events via `lastEventId` (idempotency)
3. Look up Cognito user by `app_user_id`
4. Resolve tier from product ID (e.g., `investor_monthly` -> `premium`)
5. Add user to new tier's Cognito group
6. Remove user from old tier's Cognito group (if different)
7. Update `UserSubscription` DynamoDB record
8. If tier upgrade detected, reset billing anchor (user gets fresh usage period)

### Cognito Group Management
- Users are added to exactly one paid tier group at a time
- On expiration, the user is removed from the paid group (falls back to `basic`)
- The `basic` group is assigned at signup and never removed
- `beta` and `admin` groups are managed separately

## Environment Variables

| Variable | Description |
|----------|-------------|
| `REVENUECAT_API_KEY` | API key for webhook auth validation |
| `COGNITO_USER_POOL_ID` | Cognito user pool for group management |
| `SUBSCRIPTION_TABLE_NAME` | DynamoDB table for UserSubscription records |
| `USAGE_TABLE_NAME` | DynamoDB table for billing anchor resets |

## Dependencies

- `shared/revenueCatUtils.ts` — Product-to-tier mapping, webhook auth validation
- `shared/tiers.ts` — Cognito group constants, tier ranking
- `shared/usage.ts` — `resetBillingAnchor()` for upgrade handling
- AWS Cognito SDK — User lookup, group add/remove
- AWS DynamoDB SDK — Subscription record CRUD

## Important Notes

- The handler is **idempotent** — duplicate events (same `event.id`) are detected and skipped
- `CANCELLATION` does **not** revoke access — the user retains their tier until `EXPIRATION`
- `BILLING_ISSUE` sets `in_grace_period` status but does not revoke access
- `syncSubscription` (client-side) serves as a backup sync mechanism if the webhook fails
