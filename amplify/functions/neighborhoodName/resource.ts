import { defineFunction, secret } from '@aws-amplify/backend';

export const neighborhoodName = defineFunction({
  name: 'neighborhood-name',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  },
  timeoutSeconds: 30,
  memoryMB: 150
});