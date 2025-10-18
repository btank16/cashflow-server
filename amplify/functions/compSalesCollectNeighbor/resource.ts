import { defineFunction, secret } from '@aws-amplify/backend';

export const compSalesCollectNeighbor = defineFunction({
  name: 'comp-sales-collect-neighbor',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  },
  timeoutSeconds: 30,
  memoryMB: 150,
  architecture: 'arm64',
  runtime: 22
});
