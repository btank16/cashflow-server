import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * Zillow ZIP Search Lambda function configuration
 *
 * This function uses Apify's Zillow ZIP search actor to find real estate properties
 * in specified ZIP codes with various filtering options.
 *
 * The actor can search for properties for sale, for rent, or recently sold.
 */
export const zillowZipSearch = defineFunction({
  name: 'zillow-zip-search',
  entry: './handler.ts',
  environment: {
    APIFY_API_KEY: secret('ApifyAPI')
  },
  timeoutSeconds: 300,  // 5 minutes - sufficient for most ZIP code searches
  memoryMB: 512,  // Higher memory for processing property data
  architecture: 'arm64',
  runtime: 22
});