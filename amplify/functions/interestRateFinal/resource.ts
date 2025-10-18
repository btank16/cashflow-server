import { defineFunction, secret } from '@aws-amplify/backend';

export const interestRateFinal = defineFunction({
  name: 'interest-rate-final',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  },
  timeoutSeconds: 30,
  memoryMB: 150
});
