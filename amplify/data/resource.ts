import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { newRentalWorkflow } from '../functions/newRentalWorkflow/resource_python';
import { startRentalWorkflow } from '../functions/startRentalWorkflow/resource';
import { getRentalWorkflowStatus } from '../functions/getRentalWorkflowStatus/resource';

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
      zip: a.string().required()
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
      // Add secondary index on user_id for efficient queries
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
      // Add secondary index on user_id for efficient queries
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