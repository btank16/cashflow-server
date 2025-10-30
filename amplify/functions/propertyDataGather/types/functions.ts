/**
 * Type definitions for all property data gathering functions
 * Each function has clearly defined inputs and outputs for workflow composition
 */

// ============================================
// COUNTY NAME FUNCTION
// ============================================
export interface CountyNameInput {
  city_name: string;
  state_name: string;
}

export interface CountyNameOutput {
  county_name: string;
}

// ============================================
// NEIGHBORHOOD NAME FUNCTION
// ============================================
export interface NeighborhoodNameInput {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface NeighborhoodNameOutput {
  neighborhood: string;
}

// ============================================
// INITIAL PROPERTY INFO FUNCTION
// ============================================
export interface InitialPropertyInfoInput {
  street: string;
  city: string;
  state: string;
  zip: string;
  county_name: string;  // Dependency: requires countyName output
}

export interface InitialPropertyInfoOutput {
  total_units: number;
  total_sq_ft: number;
  total_beds: number;
  total_bath: number;
  unit_sq_ft: number[];
  unit_bed: number[];
  unit_bath: number[];
}

// ============================================
// PROPERTY TAX REALTOR FUNCTION
// ============================================
export interface PropertyTaxRealtorInput {
  street: string;
  city: string;
  state: string;
  zip: string;
  year: number;
}

export interface PropertyTaxRealtorOutput {
  annual_taxes: number;
}

// ============================================
// RECENT SALE INFO FUNCTION
// ============================================
export interface RecentSaleInfoInput {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface RecentSaleInfoOutput {
  sale_date: string;
  sale_price: number;
}

// ============================================
// INTEREST RATE FINAL FUNCTION
// ============================================
export interface InterestRateFinalInput {
  state_name: string;
  down_payment: number;
  loan_type: string;
}

export interface InterestRateFinalOutput {
  interest_rate: number;
}

// ============================================
// COMPARABLE SALES FUNCTION
// ============================================
export interface ComparableSalesInput {
  street: string;
  city: string;
  state: string;
  zip: string;
  property_type: string;
  neighborhood?: string;  // Optional: if provided, searches within neighborhood; otherwise city-wide
}

export interface ComparableSalesOutput {
  addresses: string[];
}

// ============================================
// SIMILAR AREAS FUNCTION
// ============================================
export interface SimilarAreasInput {
  city: string;           // For neighborhood comparison (or city_name for city comparison)
  state: string;          // For neighborhood comparison (or state_name for city comparison)
  neighborhood?: string;  // Optional: if provided, finds similar neighborhoods; otherwise finds similar cities
  county_name?: string;   // Required only when neighborhood is not provided (for city comparison)
  city_name?: string;     // Alternative name for city (used in city comparison mode)
  state_name?: string;    // Alternative name for state (used in city comparison mode)
}

export interface SimilarAreasOutput {
  similar_areas: string[];  // List of similar neighborhoods or cities
}

// ============================================
// APARTMENT COMP FUNCTION
// ============================================
export interface ApartmentCompInput {
  neighborhood?: string;  // Optional: can use neighborhoodName output
  city: string;
  state: string;
  bed_count: number | string;
  bath_count: number | string;
}

export interface ApartmentCompOutput {
  addresses: string[];
}

// ============================================
// ZILLOW ZIP SEARCH FUNCTION (uses Apify, not Perplexity)
// ============================================
export interface ZillowZipSearchInput {
  zipCodes: string[];
  priceMin?: number;
  priceMax?: number;
  daysOnZillow?: string;  // "1", "7", "14", "30", "90", "6m", "12m", "24m", "36m"
  forSaleByAgent?: boolean;
  forSaleByOwner?: boolean;
  forRent?: boolean;
  sold?: boolean;
  maxItems?: number;  // Limit for pay-per-result
}

export interface ZillowZipSearchOutput {
  properties: any[];  // Array of property listings (hdpData field only)
  totalCount: number;
  runId: string;      // Apify run ID for reference
  datasetId: string;  // Dataset ID for reference
}

// ============================================
// METRO AREA LOOKUP FUNCTION
// ============================================
export interface MetroAreaLookupInput {
  neighborhood?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  lookupType: 'neighborhood' | 'city' | 'state' | 'hierarchy';
}

export interface MetroAreaLookupOutput {
  locationInfo?: {
    neighborhood: string;
    city: string;
    state: string;
    stateCode: string;
  };
  neighborhoods?: string[];
  cities?: string[];
  hierarchy?: {
    state: string;
    stateCode: string;
    cities: Array<{
      city: string;
      neighborhoods: string[];
    }>;
  };
  isValid?: boolean;
}