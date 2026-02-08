import { defineFunction } from '@aws-amplify/backend';

export const startRentalWorkflow = defineFunction({
  name: 'startRentalWorkflow',
  entry: './handler.ts',
  timeoutSeconds: 20,
  memoryMB: 128,
  resourceGroupName: 'data',
  architecture: 'arm64',
  runtime: 22
});
