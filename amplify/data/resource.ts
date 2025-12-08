import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { newRentalWorkflow } from '../functions/newRentalWorkflow/resource_python';

const schema = a.schema({
  // =============================================================================
  // Custom Query: New Rental Workflow
  // =============================================================================

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
      formattedOutput: a.json(),  // Contains input_property, sales_data, apartment_comps
      metadata: a.json(),          // Contains total_api_calls, execution_time, step_details
      error: a.string()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(newRentalWorkflow), {
      requestTimeout: 540 // Match Lambda timeout (540 seconds = 9 minutes)
    }),

  // =============================================================================
  // Data Models
  // =============================================================================

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