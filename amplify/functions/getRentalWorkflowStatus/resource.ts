import { defineFunction } from '@aws-amplify/backend';

export const getRentalWorkflowStatus = defineFunction({
  name: 'getRentalWorkflowStatus',
  entry: './handler.ts',
  timeoutSeconds: 20,
  memoryMB: 128,
  resourceGroupName: 'data',
  architecture: 'arm64',
  runtime: 22
});
