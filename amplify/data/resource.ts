import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

// Import all Lambda functions
import { countyName } from '../functions/countyName/resource';
import { neighborhoodName } from '../functions/neighborhoodName/resource';
import { initialPropertyInfo } from '../functions/initialPropertyInfo/resource';
import { propertyTaxRealtor } from '../functions/propertyTaxRealtor/resource';
import { recentSaleInfo } from '../functions/recentSaleInfo/resource';
import { interestRateFinal } from '../functions/interestRateFinal/resource';
import { compSalesCollectNeighbor } from '../functions/compSalesCollectNeighbor/resource';
import { compSalesCollectCity } from '../functions/compSalesCollectCity/resource';
import { socioNeighborhoodCompare } from '../functions/socioNeighborhoodCompare/resource';
import { cityCompare } from '../functions/cityCompare/resource';
import { zillowZipSearch } from '../functions/zillowZipSearch/resource';
import { apartmentComp } from '../functions/apartmentComp/resource';

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

  // Custom queries for Lambda functions
  getCountyName: a
    .query()
    .arguments({
      city_name: a.string().required(),
      state_name: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(countyName)),

  getNeighborhoodName: a
    .query()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(neighborhoodName)),

  getInitialPropertyInfo: a
    .query()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required(),
      county_name: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(initialPropertyInfo)),

  getPropertyTax: a
    .query()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required(),
      year: a.integer().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(propertyTaxRealtor)),

  getRecentSaleInfo: a
    .query()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(recentSaleInfo)),

  getInterestRate: a
    .query()
    .arguments({
      state_name: a.string().required(),
      down_payment: a.float().required(),
      loan_type: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(interestRateFinal)),

  getCompSalesNeighborhood: a
    .query()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required(),
      neighborhood: a.string().required(),
      property_type: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(compSalesCollectNeighbor)),

  getCompSalesCity: a
    .query()
    .arguments({
      street: a.string().required(),
      city: a.string().required(),
      state: a.string().required(),
      zip: a.string().required(),
      property_type: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(compSalesCollectCity)),

  getSocioNeighborhoodCompare: a
    .query()
    .arguments({
      city: a.string().required(),
      state: a.string().required(),
      neighborhood: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(socioNeighborhoodCompare)),

  getCityCompare: a
    .query()
    .arguments({
      county_name: a.string().required(),
      city_name: a.string().required(),
      state_name: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(cityCompare)),

  getZillowZipSearch: a
    .query()
    .arguments({
      zipCodes: a.string().array().required(),
      priceMin: a.float(),
      priceMax: a.float(),
      daysOnZillow: a.string(),
      forSaleByAgent: a.boolean(),
      forSaleByOwner: a.boolean(),
      forRent: a.boolean(),
      sold: a.boolean(),
      maxItems: a.integer()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(zillowZipSearch)),

  getApartmentComp: a
    .query()
    .arguments({
      neighborhood: a.string(),
      city: a.string().required(),
      state: a.string().required(),
      bed_count: a.string().required(),
      bath_count: a.string().required()
    })
    .returns(a.json())
    .authorization(allow => [allow.guest()])
    .handler(a.handler.function(apartmentComp))
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool'
  }
});