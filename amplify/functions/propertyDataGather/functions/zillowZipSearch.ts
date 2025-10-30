/**
 * Zillow ZIP Search Function
 * Searches for properties in specified ZIP codes using Apify's Zillow scraper
 *
 * @input zipCodes, priceMin, priceMax, daysOnZillow, forSaleByAgent, forSaleByOwner, forRent, sold, maxItems
 * @output properties, totalCount, runId, datasetId
 * @dependencies Apify API
 */

import { ApifyClient } from 'apify-client';
import { retryWithBackoff } from '../../common';
import {
  FunctionResult,
  ZillowZipSearchInput,
  ZillowZipSearchOutput
} from '../types';

// Actor ID for the Zillow ZIP search scraper
const ACTOR_ID = 'maxcopell/zillow-zip-search';

// Valid days on Zillow options
const VALID_DAYS_ON_ZILLOW = ['1', '7', '14', '30', '90', '6m', '12m', '24m', '36m'];

/**
 * Search for properties in specified ZIP codes using Zillow via Apify
 * @param input Search parameters including ZIP codes and filters
 * @returns Property listings or error
 */
export async function searchZillowByZip(
  input: ZillowZipSearchInput
): Promise<FunctionResult<ZillowZipSearchOutput>> {
  const startTime = Date.now();

  try {
    // Validate ZIP codes array
    if (!input.zipCodes || !Array.isArray(input.zipCodes) || input.zipCodes.length === 0) {
      return {
        success: false,
        error: 'zipCodes must be a non-empty array of ZIP codes',
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Validate ZIP code format (5 digits)
    const invalidZips = input.zipCodes.filter(zip => !/^\d{5}$/.test(zip));
    if (invalidZips.length > 0) {
      return {
        success: false,
        error: `Invalid ZIP code format: ${invalidZips.join(', ')}. ZIP codes must be 5 digits.`,
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Validate price range if provided
    if (input.priceMin !== undefined && input.priceMax !== undefined) {
      if (input.priceMin > input.priceMax) {
        return {
          success: false,
          error: 'priceMin cannot be greater than priceMax',
          errorCode: 'VALIDATION_ERROR'
        };
      }
    }

    // Validate daysOnZillow if provided
    if (input.daysOnZillow && !VALID_DAYS_ON_ZILLOW.includes(input.daysOnZillow)) {
      return {
        success: false,
        error: `Invalid daysOnZillow value. Must be one of: ${VALID_DAYS_ON_ZILLOW.join(', ')}`,
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Validate that at least one property type is selected if any are specified
    const allFalse = input.forSaleByAgent === false &&
                     input.forSaleByOwner === false &&
                     input.forRent === false &&
                     input.sold === false;
    if (allFalse) {
      return {
        success: false,
        error: 'At least one property type must be enabled (forSaleByAgent, forSaleByOwner, forRent, or sold)',
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Validate maxItems if provided
    if (input.maxItems !== undefined) {
      if (!Number.isInteger(input.maxItems) || input.maxItems <= 0) {
        return {
          success: false,
          error: 'maxItems must be a positive integer',
          errorCode: 'VALIDATION_ERROR'
        };
      }
    }

    // Get the Apify API key from environment
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: 'Apify API key not configured',
        errorCode: 'CONFIG_ERROR'
      };
    }

    // Initialize Apify client
    const client = new ApifyClient({
      token: apiKey,
      maxRetries: 8,
      minDelayBetweenRetriesMillis: 500,
      timeoutSecs: 360
    });

    // Build the actor input with only the parameters the actor accepts
    const actorInput: any = {
      zipCodes: input.zipCodes
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
      return {
        success: false,
        error: `Actor run failed with status: ${runInfo?.status || 'UNKNOWN'}`,
        errorCode: 'ACTOR_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'apify',
          searchDomains: ['zillow.com']
        }
      };
    }

    // Get the dataset items with only the hdpData field
    const dataset = client.dataset(runInfo.defaultDatasetId);
    const { items } = await dataset.listItems({
      fields: ['hdpData']  // Only retrieve the hdpData field from each item
    });

    // Validate that we got results
    if (!items || !Array.isArray(items)) {
      return {
        success: false,
        error: 'No properties found for the specified ZIP codes and filters',
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'apify',
          searchDomains: ['zillow.com']
        }
      };
    }

    // Format the output
    const output: ZillowZipSearchOutput = {
      properties: items,
      totalCount: items.length,
      runId: runInfo.id,
      datasetId: runInfo.defaultDatasetId
    };

    // Return successful result
    return {
      success: true,
      data: output,
      metadata: {
        apiCalls: 1,
        executionTime: Date.now() - startTime,
        model: 'apify',
        searchDomains: ['zillow.com'],
        searchScope: `${input.zipCodes.length} ZIP codes`,
        resultCount: items.length
      }
    };

  } catch (error) {
    // Handle timeout errors specifically
    if (error instanceof Error && error.message.includes('timeout')) {
      return {
        success: false,
        error: 'Zillow search timed out. Try searching fewer ZIP codes or adjusting filters.',
        errorCode: 'TIMEOUT_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime
        }
      };
    }

    // Handle rate limit errors
    if (error instanceof Error && error.message.includes('rate')) {
      return {
        success: false,
        error: 'Apify rate limit exceeded. Please try again later.',
        errorCode: 'RATE_LIMIT_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime
        }
      };
    }

    // Handle Apify Actor errors
    if (error instanceof Error && error.message.includes('Actor')) {
      return {
        success: false,
        error: `Apify Actor error: ${error.message}`,
        errorCode: 'ACTOR_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime
        }
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode: 'INTERNAL_ERROR',
      metadata: {
        apiCalls: 1,
        executionTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Helper function to validate ZIP codes format
 * @param zipCodes Array of ZIP codes to validate
 * @returns Object with validation result and invalid ZIP codes
 */
export function validateZipCodes(zipCodes: string[]): {
  isValid: boolean;
  invalidZips: string[]
} {
  const invalidZips = zipCodes.filter(zip => !/^\d{5}$/.test(zip));
  return {
    isValid: invalidZips.length === 0,
    invalidZips
  };
}

/**
 * Helper function to build Zillow search URL from parameters
 * @param zipCode ZIP code to search
 * @param filters Optional search filters
 * @returns Zillow search URL
 */
export function buildZillowSearchUrl(
  zipCode: string,
  filters?: Partial<ZillowZipSearchInput>
): string {
  let url = `https://www.zillow.com/homes/${zipCode}_rb/`;
  const params: string[] = [];

  if (filters?.priceMin) params.push(`${filters.priceMin}-_price`);
  if (filters?.priceMax) params.push(`${filters.priceMax}_price`);
  if (filters?.daysOnZillow) params.push(`${filters.daysOnZillow}_days`);
  if (filters?.forRent) params.push('rent');
  if (filters?.sold) params.push('sold');

  if (params.length > 0) {
    url += '?' + params.join('&');
  }

  return url;
}