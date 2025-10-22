import { defineFunction, secret } from '@aws-amplify/backend';

export const apartmentComp = defineFunction({
  name: 'apartment-comp',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  },
  timeoutSeconds: 30,
  memoryMB: 150,
  architecture: 'arm64',
  runtime: 22
});