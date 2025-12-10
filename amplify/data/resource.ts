import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { newRentalWorkflow } from '../functions/newRentalWorkflow/resource_python';
import { startRentalWorkflow } from '../functions/startRentalWorkflow/resource';
import { getRentalWorkflowStatus } from '../functions/getRentalWorkflowStatus/resource';
import { adminBetaAccess } from '../functions/adminBetaAccess/resource';
import { getEntitlements } from '../functions/getEntitlements/resource';

// Note: Lambda functions (startRentalWorkflow, getEntitlements) access UsageRecord
// and UserSubscription tables directly via DynamoDB SDK. Permissions are granted
// in backend.ts rather than using allow.resource() here.

const schema = a.schema({
  // =============================================================================
  // Async Rental Workflow
  // =============================================================================

  // Start workflow mutation - returns immediately with jobId
  startRentalWorkflow: a
    .mutation()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required(),
      timezone: a.string()  // User's timezone for daily limit calculation
    })
    .returns(a.customType({
      jobId: a.string(),
      status: a.string(),
      error: a.string()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(startRentalWorkflow)),

  // Get workflow status query - for polling
  getRentalWorkflowStatus: a
    .query()
    .arguments({
      jobId: a.string().required()
    })
    .returns(a.customType({
      jobId: a.string(),
      status: a.string(),
      currentStep: a.string(),
      completedSteps: a.json(),
      result: a.json(),
      metadata: a.json(),
      error: a.string()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(getRentalWorkflowStatus)),

  // Legacy synchronous query (keeping for backwards compatibility)
  newRentalWorkflow: a
    .query()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required()
    })
    .returns(a.customType({
      success: a.boolean(),
      formattedOutput: a.json(),
      metadata: a.json(),
      error: a.string()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(newRentalWorkflow)),

  // =============================================================================
  // Entitlements & Usage
  // =============================================================================

  // Get current user's entitlements and usage
  getMyEntitlements: a
    .query()
    .arguments({
      timezone: a.string()  // User's timezone for accurate daily usage
    })
    .returns(a.customType({
      tier: a.string().required(),
      displayName: a.string().required(),
      dailyLimit: a.integer(),
      monthlyLimit: a.integer(),
      dailyUsed: a.integer().required(),
      dailyRemaining: a.integer(),
      monthlyUsed: a.integer().required(),
      monthlyRemaining: a.integer(),
      features: a.string().array().required(),
      canUseResidentAI: a.boolean().required(),
      isAdmin: a.boolean().required(),
      source: a.string().required()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(getEntitlements)),

  // =============================================================================
  // Admin Operations
  // =============================================================================

  // Grant beta access to a user by email
  // Authorization: Only users in the 'admin' Cognito group can invoke this
  grantBetaAccess: a
    .mutation()
    .arguments({
      email: a.string().required()
    })
    .returns(a.customType({
      success: a.boolean().required(),
      message: a.string().required(),
      userId: a.string()
    }))
    .authorization(allow => [allow.group('admin')])
    .handler(a.handler.function(adminBetaAccess)),

  // Revoke beta access from a user by email
  // Authorization: Only users in the 'admin' Cognito group can invoke this
  revokeBetaAccess: a
    .mutation()
    .arguments({
      email: a.string().required()
    })
    .returns(a.customType({
      success: a.boolean().required(),
      message: a.string().required()
    }))
    .authorization(allow => [allow.group('admin')])
    .handler(a.handler.function(adminBetaAccess)),

  // List all users with beta access
  // Authorization: Only users in the 'admin' Cognito group can invoke this
  listBetaUsers: a
    .query()
    .returns(a.customType({
      users: a.json()  // Array of { email, userId, username, dateAdded }
    }))
    .authorization(allow => [allow.group('admin')])
    .handler(a.handler.function(adminBetaAccess)),

  // =============================================================================
  // Data Models
  // =============================================================================

  // Workflow job tracking for async operations
  WorkflowJob: a
    .model({
      user_id: a.string(),
      status: a.enum(['pending', 'processing', 'completed', 'failed']),
      current_step: a.string(),
      completed_steps: a.json(),
      input: a.json(),
      result: a.json(),
      metadata: a.json(),
      error: a.string()
    })
    .authorization(allow => [allow.owner()])
    .secondaryIndexes(index => [
      index('user_id')
    ]),

  // Usage tracking for rate limiting
  // Note: Lambda functions access this via direct DynamoDB SDK calls
  // Permissions granted in backend.ts
  UsageRecord: a
    .model({
      userId: a.string().required(),
      periodFunction: a.string().required(),  // 'daily#YYYY-MM-DD#timezone#functionName'
      count: a.integer().default(0),
      tier: a.string(),  // Snapshot of tier at usage time
      ttl: a.integer()   // TTL for automatic DynamoDB cleanup
    })
    .identifier(['userId', 'periodFunction'])
    .authorization(allow => [
      allow.owner().to(['read'])
    ]),

  // User subscription data (for future Stripe integration)
  // Note: Lambda functions access this via direct DynamoDB SDK calls
  // Permissions granted in backend.ts
  UserSubscription: a
    .model({
      userId: a.id().required(),
      // Stripe fields - null until integration
      stripeCustomerId: a.string(),
      stripeSubscriptionId: a.string(),
      // Subscription data
      tier: a.enum(['basic', 'beta', 'premium', 'platinum', 'admin']),
      status: a.enum(['active', 'canceled', 'past_due', 'trialing', 'legacy']),
      dailyLimit: a.integer(),
      monthlyLimit: a.integer(),
      features: a.string().array(),
      // Billing cycle
      cycleAnchorDay: a.integer(),  // Day of month (1-31) when cycle starts
      currentPeriodStart: a.datetime(),
      currentPeriodEnd: a.datetime(),
      // Migration tracking
      migratedFromCognitoGroup: a.string(),
      migrationDate: a.datetime()
    })
    .identifier(['userId'])
    .authorization(allow => [
      allow.owner().to(['read'])
    ]),

  Calculation: a
    .model({
      user_id: a.string(),
      id: a.id().required(),
      calculator_type: a.string(),
      input_values: a.string(),
      results: a.string()
    })
    .authorization(allow => [allow.owner()])
    .secondaryIndexes(index => [
      index('user_id')
    ]),

  Expense: a
    .model({
      user_id: a.string(),
      id: a.id().required(),
      category: a.string(),
      cost: a.string(),
      frequency: a.string(),
      applicable_calculators: a.string()
    })
    .authorization(allow => [allow.owner()])
    .secondaryIndexes(index => [
      index('user_id')
    ])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool'
  }
});
