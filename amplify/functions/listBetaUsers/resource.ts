import { defineFunction } from '@aws-amplify/backend';

export const listBetaUsers = defineFunction({
  name: 'list-beta-users',
  entry: './handler.ts',
  timeoutSeconds: 30,
  runtime: 22,
  memoryMB: 128,
  resourceGroupName: 'data',
  architecture: 'arm64'
});
