import { ApifyClient } from 'apify-client';
import {
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

/**
 * Input parameters for the Zillow ZIP Search Lambda function
 * Based on the actual Apify actor input schema
 */
export interface ZillowZipSearchInput {
  zipCodes: string[];      // Required: Array of ZIP codes to search
  priceMin?: number;        // Optional: Minimum price
  priceMax?: number;        // Optional: Maximum price
  daysOnZillow?: string;    // Optional: Days on Zillow filter (e.g., "1", "7", "14", "30", "90", "6m", "12m", "24m", "36m")
  forSaleByAgent?: boolean; // Optional: Include properties for sale by agent
  forSaleByOwner?: boolean; // Optional: Include properties for sale by owner
  forRent?: boolean;        // Optional: Include properties for rent
  sold?: boolean;           // Optional: Include recently sold properties
  maxItems?: number;        // Optional: Maximum number of items for Apify to return (pay-per-result limit)
  proxyCountryCode?: string; // Optional: Two-letter country code for residential proxy (e.g., "US", "FR", "GB")
}

/**
 * Output structure for the Zillow ZIP Search Lambda function
 */
export interface ZillowZipSearchOutput {
  properties: any[];  // Array of property listings (each containing only hdpData field)
  totalCount: number; // Total number of properties found
  runId: string;      // Apify run ID for reference
  datasetId: string;  // Dataset ID for reference
}

// Actor ID for the Zillow ZIP search scraper
const ACTOR_ID = 'maxcopell/zillow-zip-search';

/**
 * Lambda handler for Zillow ZIP code property search using Apify
 *
 * This function runs the Zillow ZIP search actor to find properties
 * in specified ZIP codes with various filtering options.
 *
 * The function uses Apify residential proxies to avoid rate limiting
 * and improve reliability. You can optionally specify a country code
 * for the proxy location.
 *
 * Note: The response only includes the 'hdpData' field from each property
 * to optimize data transfer and processing.
 *
 * Example usage:
 * {
 *   "zipCodes": ["10001", "10002"],
 *   "priceMin": 100000,
 *   "priceMax": 500000,
 *   "daysOnZillow": "30",
 *   "forSaleByAgent": true,
 *   "forSaleByOwner": false,
 *   "forRent": false,
 *   "sold": false,
 *   "maxItems": 100,
 *   "proxyCountryCode": "US"
 * }
 */
export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: ZillowZipSearchInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['zipCodes']);
    if (!validation.isValid) {
      return createErrorResponse(
        `Missing required fields: ${validation.missingFields.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Validate ZIP codes array
    if (!Array.isArray(input.zipCodes) || input.zipCodes.length === 0) {
      return createErrorResponse(
        'zipCodes must be a non-empty array of ZIP codes',
        'VALIDATION_ERROR'
      );
    }

    // Validate ZIP code format (5 digits)
    const invalidZips = input.zipCodes.filter(zip => !/^\d{5}$/.test(zip));
    if (invalidZips.length > 0) {
      return createErrorResponse(
        `Invalid ZIP code format: ${invalidZips.join(', ')}. ZIP codes must be 5 digits.`,
        'VALIDATION_ERROR'
      );
    }

    // Validate price range if provided
    if (input.priceMin !== undefined && input.priceMax !== undefined) {
      if (input.priceMin > input.priceMax) {
        return createErrorResponse(
          'priceMin cannot be greater than priceMax',
          'VALIDATION_ERROR'
        );
      }
    }

    // Validate daysOnZillow if provided
    const validDaysOnZillow = ['1', '7', '14', '30', '90', '6m', '12m', '24m', '36m'];
    if (input.daysOnZillow && !validDaysOnZillow.includes(input.daysOnZillow)) {
      return createErrorResponse(
        `Invalid daysOnZillow value. Must be one of: ${validDaysOnZillow.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Validate that at least one property type is selected if any are specified
    const hasPropertyTypes = input.forSaleByAgent || input.forSaleByOwner || input.forRent || input.sold;
    if (hasPropertyTypes === false) {
      // If explicitly set to false for all, warn the user
      const allFalse = input.forSaleByAgent === false && input.forSaleByOwner === false &&
                       input.forRent === false && input.sold === false;
      if (allFalse) {
        return createErrorResponse(
          'At least one property type must be enabled (forSaleByAgent, forSaleByOwner, forRent, or sold)',
          'VALIDATION_ERROR'
        );
      }
    }

    // Validate maxItems if provided
    if (input.maxItems !== undefined) {
      if (!Number.isInteger(input.maxItems) || input.maxItems <= 0) {
        return createErrorResponse(
          'maxItems must be a positive integer',
          'VALIDATION_ERROR'
        );
      }
    }

    // Validate proxyCountryCode if provided
    if (input.proxyCountryCode !== undefined) {
      if (!/^[A-Z]{2}$/.test(input.proxyCountryCode)) {
        return createErrorResponse(
          'proxyCountryCode must be a two-letter uppercase country code (e.g., "US", "FR", "GB")',
          'VALIDATION_ERROR'
        );
      }
    }

    // Get the Apify API key from environment
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey) {
      return createErrorResponse('Apify API key not configured', 'CONFIG_ERROR');
    }

    // Initialize Apify client
    const client = new ApifyClient({
      token: apiKey,
      maxRetries: 8,
      minDelayBetweenRetriesMillis: 500,
      timeoutSecs: 360
    });

    // Build the proxy configuration for residential proxies
    const proxyConfiguration: any = {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL']
    };

    // Add country code if specified
    if (input.proxyCountryCode) {
      proxyConfiguration.apifyProxyCountry = input.proxyCountryCode;
    }

    // Build the actor input with only the parameters the actor accepts
    const actorInput: any = {
      zipCodes: input.zipCodes,
      proxyConfiguration: proxyConfiguration
    };

    // Add optional filters if provided
    if (input.priceMin !== undefined) actorInput.priceMin = input.priceMin;
    if (input.priceMax !== undefined) actorInput.priceMax = input.priceMax;
    if (input.daysOnZillow) actorInput.daysOnZillow = input.daysOnZillow;
    if (input.forSaleByAgent !== undefined) actorInput.forSaleByAgent = input.forSaleByAgent;
    if (input.forSaleByOwner !== undefined) actorInput.forSaleByOwner = input.forSaleByOwner;
    if (input.forRent !== undefined) actorInput.forRent = input.forRent;
    if (input.sold !== undefined) actorInput.sold = input.sold;

    // Build the call options with maxItems if provided
    const callOptions: any = {
      timeout: 300  // 5 minute timeout
    };

    // Add maxItems to call options if specified (not part of actor input)
    if (input.maxItems !== undefined) {
      callOptions.maxItems = input.maxItems;
    }

    // Run the actor with retry logic
    const runInfo = await retryWithBackoff(async () => {
      return await client.actor(ACTOR_ID).call(actorInput, callOptions);
    }, 3, 2000); // 3 retries with 2 second initial delay

    // Check if the run was successful
    if (!runInfo || runInfo.status !== 'SUCCEEDED') {
      return createErrorResponse(
        `Actor run failed with status: ${runInfo?.status || 'UNKNOWN'}`,
        'ACTOR_ERROR'
      );
    }

    // Get the dataset items with only the hdpData field
    const dataset = client.dataset(runInfo.defaultDatasetId);
    const { items } = await dataset.listItems({
      fields: ['hdpData']  // Only retrieve the hdpData field from each item
    });

    // Validate that we got results
    if (!items || !Array.isArray(items)) {
      return createErrorResponse(
        'No properties found for the specified ZIP codes and filters',
        'NO_DATA'
      );
    }

    // Format the output
    const output: ZillowZipSearchOutput = {
      properties: items,
      totalCount: items.length,
      runId: runInfo.id,
      datasetId: runInfo.defaultDatasetId
    };

    // Return the successful response
    return createSuccessResponse(output);

  } catch (error) {
    console.error('Handler error:', error);

    // Handle timeout errors specifically
    if (error instanceof Error && error.message.includes('timeout')) {
      return createErrorResponse(
        'Zillow search timed out. Try searching fewer ZIP codes or adjusting filters.',
        'TIMEOUT_ERROR'
      );
    }

    // Handle rate limit errors
    if (error instanceof Error && error.message.includes('rate')) {
      return createErrorResponse(
        'Apify rate limit exceeded. Please try again later.',
        'RATE_LIMIT_ERROR'
      );
    }

    // Handle Apify API errors
    if (error instanceof Error && error.message.includes('Actor')) {
      return createErrorResponse(
        `Apify Actor error: ${error.message}`,
        'ACTOR_ERROR'
      );
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      'INTERNAL_ERROR'
    );
  }
};