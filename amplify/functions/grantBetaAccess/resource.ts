import { defineFunction } from '@aws-amplify/backend';

export const grantBetaAccess = defineFunction({
  name: 'grant-beta-access',
  entry: './handler.ts',
  timeoutSeconds: 20,
  runtime: 22,
  memoryMB: 128,
  resourceGroupName: 'data',
  architecture: 'arm64'
});
