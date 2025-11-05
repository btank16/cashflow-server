/**
 * Common type definitions used across all property data gathering functions
 */

/**
 * Standard result wrapper for all functions
 * Provides consistent error handling and metadata
 */
export interface FunctionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  metadata?: {
    apiCalls: number;
    executionTime: number;
    model?: string;
    searchDomains?: string[];
    cacheHit?: boolean;
    searchScope?: string;  // Added for comparable sales function
    [key: string]: any;    // Allow additional metadata fields
  };
}

/**
 * Common address structure used by multiple functions
 */
export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * Extended address with optional fields
 */
export interface ExtendedAddress extends Address {
  county?: string;
  neighborhood?: string;
}