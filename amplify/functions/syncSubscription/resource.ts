import { defineFunction, secret } from '@aws-amplify/backend';

export const syncSubscription = defineFunction({
  name: 'sync-subscription',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 256,
  resourceGroupName: 'data',
  environment: {
    REVENUECAT_API_KEY: secret('RevenueCat')
  },
  architecture: 'arm64',
  runtime: 22
});
