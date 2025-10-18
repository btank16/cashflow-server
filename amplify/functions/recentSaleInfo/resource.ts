import { defineFunction, secret } from '@aws-amplify/backend';

export const recentSaleInfo = defineFunction({
  name: 'recent-sale-info',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  },
  timeoutSeconds: 30,
  memoryMB: 512
});
