import { defineFunction, secret } from '@aws-amplify/backend';

export const offerLetter = defineFunction({
  name: 'offer-letter',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 128,
  environment: {
    GEMINI_API_KEY: secret('GeminiAPI')
  },
  architecture: 'arm64',
  runtime: 22
});
