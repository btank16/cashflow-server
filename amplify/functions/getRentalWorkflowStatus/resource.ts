import { defineFunction } from '@aws-amplify/backend';

export const getRentalWorkflowStatus = defineFunction({
  name: 'getRentalWorkflowStatus',
  entry: './handler.ts',
  timeoutSeconds: 10,
  memoryMB: 128,
  resourceGroupName: 'data'
});
