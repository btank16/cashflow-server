import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { newRentalWorkflow } from '../functions/newRentalWorkflow/resource_python';
import { startRentalWorkflow } from '../functions/startRentalWorkflow/resource';
import { getRentalWorkflowStatus } from '../functions/getRentalWorkflowStatus/resource';
import { getEntitlements } from '../functions/getEntitlements/resource';
import { grantBetaAccess } from '../functions/grantBetaAccess/resource';
import { revokeBetaAccess } from '../functions/revokeBetaAccess/resource';
import { listBetaUsers } from '../functions/listBetaUsers/resource';
import { geminiArticles } from '../functions/geminiArticles/resource';
import { offerLetter } from '../functions/offerLetter/resource';
import { interestRateLookup } from '../functions/interestRateLookup/resource';
import { syncSubscription } from '../functions/syncSubscription/resource';

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
      timezone: a.string(),  // User's timezone for billing period calculation
      config: a.json()  // Optional workflow configuration (e.g., { skip_rental_comps: true })
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
      zip: a.string().required(),
      config: a.json()  // Optional workflow configuration (e.g., { skip_rental_comps: true })
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
      timezone: a.string()  // User's timezone for billing period calculation
    })
    .returns(a.customType({
      tier: a.string().required(),
      displayName: a.string().required(),
      monthlyLimit: a.integer(),
      monthlyUsed: a.integer().required(),
      monthlyRemaining: a.integer(),
      periodStart: a.string().required(),  // YYYY-MM-DD
      periodEnd: a.string().required(),    // YYYY-MM-DD
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
    .handler(a.handler.function(grantBetaAccess)),

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
    .handler(a.handler.function(revokeBetaAccess)),

  // List all users with beta access
  // Authorization: Only users in the 'admin' Cognito group can invoke this
  listBetaUsers: a
    .query()
    .returns(a.customType({
      users: a.json()  // Array of { email, userId, username, dateAdded }
    }))
    .authorization(allow => [allow.group('admin')])
    .handler(a.handler.function(listBetaUsers)),

  // =============================================================================
  // Gemini AI
  // =============================================================================

  // Generate article content using Gemini 2.0 Flash
  geminiArticles: a
    .query()
    .arguments({
      systemPrompt: a.string().required(),
      userPrompt: a.string().required()
    })
    .returns(a.customType({
      success: a.boolean().required(),
      description: a.string(),
      question_one: a.string(),
      question_two: a.string(),
      question_three: a.string(),
      error: a.string()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(geminiArticles)),

  // Generate offer letter using Gemini AI
  generateOfferLetter: a
    .mutation()
    .arguments({
      offerType: a.string().required(),  // 'rental', 'flip', 'brrrr'
      receiver: a.string().required(),
      inputData: a.json().required(),
      senderFirstName: a.string(),  // Optional: sender's first name for letter signature
      senderLastName: a.string()    // Optional: sender's last name for letter signature
    })
    .returns(a.customType({
      success: a.boolean().required(),
      letter: a.string(),
      error: a.string()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(offerLetter)),

  // Look up current mortgage interest rates
  lookupInterestRate: a
    .query()
    .arguments({
      loanType: a.string().required(),      // e.g., "30-year fixed"
      isPersonal: a.boolean().required(),   // true = primary residence, false = investment
      downPayment: a.integer().required(),  // 5, 10, 15, or 20
      state: a.string().required()          // e.g., "Ohio"
    })
    .returns(a.customType({
      baseRate: a.float().required(),
      adjRate: a.float().required()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(interestRateLookup)),

  // =============================================================================
  // Subscription Management (RevenueCat)
  // =============================================================================

  // Sync subscription status from RevenueCat
  // Called after purchases or to verify subscription state
  syncSubscription: a
    .mutation()
    .arguments({
      revenueCatAppUserId: a.string().required()
    })
    .returns(a.customType({
      success: a.boolean().required(),
      tier: a.string(),
      status: a.string(),
      expiresDate: a.string(),
      error: a.string()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(syncSubscription)),

  // =============================================================================
  // Data Models
  // =============================================================================

  // Workflow job tracking for async operations
  WorkflowJob: a
    .model({
      status: a.enum(['pending', 'processing', 'completed', 'failed']),
      current_step: a.string(),
      completed_steps: a.json(),
      input: a.json(),
      result: a.json(),
      metadata: a.json(),
      error: a.string()
    })
    .authorization(allow => [allow.owner()]),

  // Usage tracking for rate limiting
  // Note: Lambda functions access this via direct DynamoDB SDK calls
  // Permissions granted in backend.ts
  UsageRecord: a
    .model({
      userId: a.string().required(),
      periodFunction: a.string().required(),  // 'billing#YYYY-MM-DD#timezone#functionName' or 'anchor#timezone#functionName'
      count: a.integer().default(0),
      tier: a.string(),  // Snapshot of tier at usage time
      ttl: a.integer(),  // TTL for automatic DynamoDB cleanup
      // Explicit timestamps required for models with custom identifiers
      createdAt: a.datetime(),
      updatedAt: a.datetime()
    })
    .identifier(['userId', 'periodFunction'])
    .authorization(allow => [
      allow.owner().to(['read'])
    ]),

  // Distributed rate limiting for external API calls (Nominatim, Rentcast, Overpass)
  // Uses sliding window counter algorithm with DynamoDB atomic updates
  // Note: Lambda functions access this via direct DynamoDB SDK calls
  // Permissions granted in backend.ts
  RateLimitCounter: a
    .model({
      service: a.string().required(),       // Service name: 'nominatim', 'rentcast', 'overpass'
      window: a.string().required(),        // Time window: unix timestamp (e.g., '1703001234')
      request_count: a.integer().default(0), // Number of requests in this window
      ttl: a.integer(),                     // TTL for automatic cleanup (60 seconds after window)
      // Explicit timestamps required for models with custom identifiers
      createdAt: a.datetime(),
      updatedAt: a.datetime()
    })
    .identifier(['service', 'window'])
    .authorization(allow => [
      allow.authenticated().to(['read'])    // Lambda uses IAM, not user auth
    ]),

  // User subscription data (RevenueCat integration)
  // Note: Lambda functions access this via direct DynamoDB SDK calls
  // Permissions granted in backend.ts
  UserSubscription: a
    .model({
      userId: a.id().required(),
      // RevenueCat fields
      revenueCatAppUserId: a.string(),
      productId: a.string(),  // e.g., 'investor_annual', 'mogul_monthly'
      platform: a.enum(['ios', 'android']),
      // Subscription data
      tier: a.enum(['basic', 'beta', 'premium', 'platinum', 'admin']),
      status: a.enum(['active', 'expired', 'in_grace_period', 'paused', 'canceled', 'trialing', 'legacy']),
      // Billing dates
      purchaseDate: a.datetime(),
      expiresDate: a.datetime(),
      // Sync tracking
      lastEventId: a.string(),  // For webhook idempotency
      lastSyncedAt: a.datetime(),
      syncSource: a.enum(['webhook', 'client', 'admin']),
      // Migration tracking
      migratedFromCognitoGroup: a.string(),
      migrationDate: a.datetime(),
      // Explicit timestamps required for models with custom identifiers
      createdAt: a.datetime(),
      updatedAt: a.datetime()
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
