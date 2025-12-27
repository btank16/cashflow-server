import { defineFunction, secret } from '@aws-amplify/backend';

export const interestRateLookup = defineFunction({
  name: 'interest-rate-lookup',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 128,
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  }
});
