import { defineFunction, secret } from '@aws-amplify/backend';

export const revenueCatWebhook = defineFunction({
  name: 'revenuecat-webhook',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 128,
  environment: {
    REVENUECAT_API_KEY: secret('RevenueCat')
  },
  architecture: 'arm64',
  runtime: 22
});
