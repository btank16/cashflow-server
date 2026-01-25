import { defineFunction } from '@aws-amplify/backend';

export const uploadPDF = defineFunction({
  name: 'uploadPDF',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 256,
});
