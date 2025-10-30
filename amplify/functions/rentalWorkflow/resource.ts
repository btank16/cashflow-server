/**
 * AWS CDK Resource Configuration for Rental Workflow Lambda
 * Defines the Lambda function and its configuration
 */

import { defineFunction, secret } from '@aws-amplify/backend';

export const rentalWorkflow = defineFunction({
  name: 'rentalWorkflow',
  entry: './handler.ts',
  runtime: 22, // Node.js 22.x
  architecture: 'arm64',
  timeoutSeconds: 180, // 3 minutes timeout for workflow execution (increased for Zillow search)
  memoryMB: 512, // 512 MB memory for handling multiple API calls
  environment: {
    PERPLEXITY_API_KEY: secret('PerplexityAPI'),
    APIFY_API_KEY: secret('ApifyAPI'), // Required for Zillow search
    NODE_OPTIONS: '--enable-source-maps', // Better error tracking
  }
});