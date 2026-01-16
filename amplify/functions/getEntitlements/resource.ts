import { defineFunction } from '@aws-amplify/backend';

export const getEntitlements = defineFunction({
  name: 'get-entitlements',
  entry: './handler.ts',
  timeoutSeconds: 20,
  runtime: 22,
  memoryMB: 128,
  resourceGroupName: 'data',
  architecture: 'arm64'
});
