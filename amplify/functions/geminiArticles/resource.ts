import { defineFunction, secret } from '@aws-amplify/backend';

export const geminiArticles = defineFunction({
  name: 'gemini-articles',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 128,
  environment: {
    GEMINI_API_KEY: secret('GeminiAPI')
  },
  architecture: 'arm64',
  runtime: 22
});
