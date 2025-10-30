/**
 * Property Data Gather Module
 * Central export point for all property data gathering functions
 *
 * This module provides reusable functions that can be composed into workflows
 * Each function is designed to work independently or as part of a larger workflow
 */

// ============================================
// TYPE EXPORTS
// ============================================
export * from './types';

// ============================================
// FUNCTION EXPORTS
// ============================================

// Location lookup functions
export { getCountyName } from './functions/countyLookup';
export { getNeighborhoodName } from './functions/neighborhoodLookup';

// Property information functions
export { getInitialPropertyInfo } from './functions/propertyDetails';
export { getPropertyTax } from './functions/propertyTax';
export { getRecentSaleInfo } from './functions/recentSales';

// Financial functions
export { getInterestRate } from './functions/interestRates';

// Comparable sales function
export { getComparableSales } from './functions/comparableSales';

// Similar areas function
export { getSimilarAreas } from './functions/similarAreas';

// Rental search functions
export { getApartmentComps } from './functions/apartmentSearch';

// Note: Zillow search uses Apify and will be added separately when needed

// ============================================
// WORKFLOW HELPERS
// ============================================

/**
 * Helper function to check if a function result was successful
 */
export function isSuccess<T>(result: { success: boolean; data?: T }): result is { success: true; data: T } {
  return result.success === true && result.data !== undefined;
}

/**
 * Helper function to extract data from a successful result or throw
 */
export function extractData<T>(result: { success: boolean; data?: T; error?: string }): T {
  if (!isSuccess(result)) {
    throw new Error(result.error || 'Function failed without error message');
  }
  return result.data;
}

/**
 * Helper function to combine metadata from multiple function results
 */
export function combineMetadata(results: Array<{ metadata?: any }>): {
  totalApiCalls: number;
  totalExecutionTime: number;
  models: string[];
  searchDomains: string[];
} {
  return results.reduce((acc, result) => {
    if (result.metadata) {
      acc.totalApiCalls += result.metadata.apiCalls || 0;
      acc.totalExecutionTime += result.metadata.executionTime || 0;
      if (result.metadata.model && !acc.models.includes(result.metadata.model)) {
        acc.models.push(result.metadata.model);
      }
      if (result.metadata.searchDomains && Array.isArray(result.metadata.searchDomains)) {
        result.metadata.searchDomains.forEach((domain: string) => {
          if (!acc.searchDomains.includes(domain)) {
            acc.searchDomains.push(domain);
          }
        });
      }
    }
    return acc;
  }, {
    totalApiCalls: 0,
    totalExecutionTime: 0,
    models: [] as string[],
    searchDomains: [] as string[]
  });
}