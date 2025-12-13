import { defineFunction } from '@aws-amplify/backend';

export const revokeBetaAccess = defineFunction({
  name: 'revoke-beta-access',
  entry: './handler.ts',
  timeoutSeconds: 30,
  runtime: 22,
  memoryMB: 128,
  resourceGroupName: 'data'
});
