import { defineFunction, secret } from '@aws-amplify/backend';

export const unitCount = defineFunction({
  name: 'unit-count',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  }
});