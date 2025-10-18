import { defineFunction, secret } from '@aws-amplify/backend';

export const initialPropertyInfo = defineFunction({
  name: 'initial-property-info',
  entry: './handler.ts',
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI')
  },
  timeoutSeconds: 30,
  memoryMB: 512
});