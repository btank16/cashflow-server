import { defineFunction } from '@aws-amplify/backend';

export const adminBetaAccess = defineFunction({
  name: 'admin-beta-access',
  entry: './handler.ts',
  timeoutSeconds: 30,
  runtime: 22,
  memoryMB: 128,
  resourceGroupName: 'data'
});
