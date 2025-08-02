import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { unitCount } from '../functions/unit_count/resource';

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
    ]),

  getUnitCount: a
    .query()
    .arguments({
      address: a.string().required()
    })
    .returns(a.customType({
      unit_count: a.integer().required(),
      bedrooms: a.integer().array(),
      bathrooms: a.float().array(),
      square_feet: a.integer().array()
    }))
    .authorization(allow => [allow.authenticated()])
    .handler(a.handler.function(unitCount))
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool'
  }
});