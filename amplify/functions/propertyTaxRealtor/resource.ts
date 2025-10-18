import { defineFunction, secret } from '@aws-amplify/backend';

export const propertyTaxRealtor = defineFunction({
  name: 'property-tax-realtor',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  },
  timeoutSeconds: 30,
  memoryMB: 150
});