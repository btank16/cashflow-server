import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
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