import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Calculation: a.model({
    unique_id: a.string(),
    user_id: a.string(),
    date: a.string(),
    calculator_type: a.string(),
    input_values: a.json(),
    results: a.json()
  }).authorization(allow => [
    // Only allow users to access their own data
    allow.owner().to(['create', 'read', 'update', 'delete'])
  ]),

  Expense: a.model({
    user_id: a.string(),
    date: a.string(),
    category: a.string(),
    cost: a.string(),
    frequency: a.string(),
    applicable_calculators: a.json()
  }).authorization(allow => [
    allow.owner().to(['create', 'read', 'update', 'delete'])
  ])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool'
  }
});