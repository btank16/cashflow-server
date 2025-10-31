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
  ZillowZipSearchOutput,
  ProcessedZillowData,
  ZillowPropertyInfo,
  ZillowHomeTypeStats
} from '../types';

// Actor ID for the Zillow ZIP search scraper
const ACTOR_ID = 'maxcopell/zillow-zip-search';

// Valid days on Zillow options
const VALID_DAYS_ON_ZILLOW = ['1', '7', '14', '30', '90', '6m', '12m', '24m', '36m'];

/**
 * Process raw Zillow property data into organized structure by homeType
 * @param rawProperties Array of raw property data from Zillow
 * @returns Processed and organized data
 */
function processZillowProperties(rawProperties: any[]): ProcessedZillowData {
  const byHomeType: { [key: string]: ZillowHomeTypeStats } = {};
  const allPrices: number[] = [];
  const homeTypes = new Set<string>();

  // First pass: organize properties by homeType
  rawProperties.forEach(item => {
    const homeInfo = item?.hdpData?.homeInfo;
    if (!homeInfo) return;

    const homeType = homeInfo.homeType || 'UNKNOWN';
    homeTypes.add(homeType);

    // Extract and calculate property information
    const propertyInfo: ZillowPropertyInfo = {
      address: homeInfo.streetAddress || 'N/A',
      price: homeInfo.price || 0,
      pricePerSqFt: (homeInfo.price && homeInfo.livingArea)
        ? Math.round(homeInfo.price / homeInfo.livingArea)
        : null,
      pricePerBedroom: (homeInfo.price && homeInfo.bedrooms > 0)
        ? Math.round(homeInfo.price / homeInfo.bedrooms)
        : null,
      bedrooms: homeInfo.bedrooms || 0,
      bathrooms: homeInfo.bathrooms || 0,
      livingArea: homeInfo.livingArea || null,
      zipcode: homeInfo.zipcode || '',
      city: homeInfo.city || '',
      state: homeInfo.state || '',
      homeStatus: homeInfo.homeStatus || '',
      daysOnZillow: homeInfo.daysOnZillow || 0,
      zestimate: homeInfo.zestimate,
      rentZestimate: homeInfo.rentZestimate
    };

    // Initialize homeType group if needed
    if (!byHomeType[homeType]) {
      byHomeType[homeType] = {
        properties: [],
        statistics: {
          count: 0,
          minPrice: Infinity,
          maxPrice: -Infinity,
          medianPrice: 0,
          avgPrice: 0,
          avgPricePerSqFt: null,
          avgPricePerBedroom: null
        }
      };
    }

    // Add property to its homeType group
    byHomeType[homeType].properties.push(propertyInfo);

    if (homeInfo.price) {
      allPrices.push(homeInfo.price);
    }
  });

  // Second pass: calculate statistics for each homeType
  Object.keys(byHomeType).forEach(homeType => {
    const group = byHomeType[homeType];
    const prices = group.properties
      .map(p => p.price)
      .filter(p => p > 0)
      .sort((a, b) => a - b);

    if (prices.length > 0) {
      // Basic price statistics
      group.statistics.count = group.properties.length;
      group.statistics.minPrice = Math.min(...prices);
      group.statistics.maxPrice = Math.max(...prices);
      group.statistics.avgPrice = Math.round(
        prices.reduce((sum, p) => sum + p, 0) / prices.length
      );

      // Calculate median
      const mid = Math.floor(prices.length / 2);
      group.statistics.medianPrice = prices.length % 2 === 0
        ? Math.round((prices[mid - 1] + prices[mid]) / 2)
        : prices[mid];

      // Calculate average price per sq ft
      const pricesPerSqFt = group.properties
        .map(p => p.pricePerSqFt)
        .filter(p => p !== null) as number[];

      if (pricesPerSqFt.length > 0) {
        group.statistics.avgPricePerSqFt = Math.round(
          pricesPerSqFt.reduce((sum, p) => sum + p, 0) / pricesPerSqFt.length
        );
      }

      // Calculate average price per bedroom
      const pricesPerBedroom = group.properties
        .map(p => p.pricePerBedroom)
        .filter(p => p !== null) as number[];

      if (pricesPerBedroom.length > 0) {
        group.statistics.avgPricePerBedroom = Math.round(
          pricesPerBedroom.reduce((sum, p) => sum + p, 0) / pricesPerBedroom.length
        );
      }
    }
  });

  // Calculate overall summary
  const validPrices = allPrices.filter(p => p > 0);
  const summary = {
    totalProperties: rawProperties.length,
    homeTypes: Array.from(homeTypes).sort(),
    priceRange: {
      min: validPrices.length > 0 ? Math.min(...validPrices) : 0,
      max: validPrices.length > 0 ? Math.max(...validPrices) : 0
    },
    dateProcessed: new Date().toISOString()
  };

  return {
    byHomeType,
    summary
  };
}

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

    // Process the raw data to organize by homeType
    const processedData = processZillowProperties(items);

    // Format the output with both raw and processed data
    const output: ZillowZipSearchOutput = {
      properties: items,  // Raw data
      processedData: processedData,  // Organized and analyzed data
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

/**
 * Get summary statistics for a specific home type from processed data
 * @param processedData The processed Zillow data
 * @param homeType The specific home type to get stats for
 * @returns Statistics for the home type or null if not found
 */
export function getHomeTypeStats(
  processedData: ProcessedZillowData,
  homeType: string
): ZillowHomeTypeStats | null {
  return processedData.byHomeType[homeType] || null;
}

/**
 * Get all addresses for a specific home type from processed data
 * @param processedData The processed Zillow data
 * @param homeType The specific home type
 * @returns Array of addresses for that home type
 */
export function getAddressesByHomeType(
  processedData: ProcessedZillowData,
  homeType: string
): string[] {
  const stats = processedData.byHomeType[homeType];
  if (!stats) return [];

  return stats.properties.map(p => `${p.address}, ${p.city}, ${p.state} ${p.zipcode}`);
}

/**
 * Filter processed data by price range
 * @param processedData The processed Zillow data
 * @param minPrice Minimum price filter
 * @param maxPrice Maximum price filter
 * @returns Filtered processed data
 */
export function filterByPriceRange(
  processedData: ProcessedZillowData,
  minPrice?: number,
  maxPrice?: number
): ProcessedZillowData {
  const filteredByHomeType: { [key: string]: ZillowHomeTypeStats } = {};

  Object.entries(processedData.byHomeType).forEach(([homeType, stats]) => {
    const filteredProperties = stats.properties.filter(p => {
      if (minPrice && p.price < minPrice) return false;
      if (maxPrice && p.price > maxPrice) return false;
      return true;
    });

    if (filteredProperties.length > 0) {
      // Recalculate statistics for filtered properties
      const prices = filteredProperties.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
      const mid = Math.floor(prices.length / 2);

      filteredByHomeType[homeType] = {
        properties: filteredProperties,
        statistics: {
          count: filteredProperties.length,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          medianPrice: prices.length % 2 === 0
            ? Math.round((prices[mid - 1] + prices[mid]) / 2)
            : prices[mid],
          avgPrice: Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length),
          avgPricePerSqFt: stats.statistics.avgPricePerSqFt,
          avgPricePerBedroom: stats.statistics.avgPricePerBedroom
        }
      };
    }
  });

  return {
    byHomeType: filteredByHomeType,
    summary: {
      ...processedData.summary,
      totalProperties: Object.values(filteredByHomeType).reduce((sum, s) => sum + s.properties.length, 0),
      priceRange: {
        min: minPrice || processedData.summary.priceRange.min,
        max: maxPrice || processedData.summary.priceRange.max
      }
    }
  };
}