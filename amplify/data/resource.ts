import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Calculation: a
    .model({
      id: a.id().required(),
      user_id: a.string(),
      date: a.string(),
      calculator_type: a.string(),
      input_values: a.string(),
      results: a.string()
    })
    .authorization(allow => [
      // Only allow users to access their own data
      allow.owner().to(['create', 'read', 'update', 'delete'])
    ])
    .secondaryIndexes(index => [
      // Add secondary index on user_id for efficient queries
      index('user_id')
    ]),

  Expense: a
    .model({
      id: a.id().required(),
      user_id: a.string(),
      date: a.string(),
      category: a.string(),
      cost: a.string(),
      frequency: a.string(),
      applicable_calculators: a.string()
    })
    .authorization(allow => [
      allow.owner().to(['create', 'read', 'update', 'delete'])
    ])
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