/**
 * Metro Area Lookup Function
 * Provides static lookup for metro areas, cities, and neighborhoods
 *
 * @description Static data and helper functions for location hierarchy lookups
 * @dependencies None
 */

import { FunctionResult } from '../types';

/**
 * Location hierarchy interface
 */
export interface LocationInfo {
  neighborhood: string;
  city: string;
  state: string;
  stateCode: string;
}

/**
 * State hierarchy structure
 */
export interface StateHierarchy {
  state: string;
  stateCode: string;
  cities: Array<{
    city: string;
    neighborhoods: string[];
  }>;
}

/**
 * Metro area lookup input
 */
export interface MetroAreaLookupInput {
  neighborhood?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  lookupType: 'neighborhood' | 'city' | 'state' | 'hierarchy';
}

/**
 * Metro area lookup output
 */
export interface MetroAreaLookupOutput {
  locationInfo?: LocationInfo;
  neighborhoods?: string[];
  cities?: string[];
  hierarchy?: StateHierarchy;
  isValid?: boolean;
}

// ============================================
// STATIC DATA - OHIO
// ============================================

// Flat map: Neighborhood -> Full location hierarchy
export const NEIGHBORHOOD_TO_LOCATION = new Map<string, LocationInfo>([
  // Columbus neighborhoods
  ["Short North", { neighborhood: "Short North", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["German Village", { neighborhood: "German Village", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Clintonville", { neighborhood: "Clintonville", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Downtown Columbus", { neighborhood: "Downtown Columbus", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Arena District", { neighborhood: "Arena District", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Grandview Heights", { neighborhood: "Grandview Heights", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Victorian Village", { neighborhood: "Victorian Village", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Italian Village", { neighborhood: "Italian Village", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Brewery District", { neighborhood: "Brewery District", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["University District", { neighborhood: "University District", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Bexley", { neighborhood: "Bexley", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Upper Arlington", { neighborhood: "Upper Arlington", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Westerville", { neighborhood: "Westerville", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Dublin", { neighborhood: "Dublin", city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Hilliard", { neighborhood: "Hilliard", city: "Columbus", state: "Ohio", stateCode: "OH" }],

  // Cleveland neighborhoods
  ["Downtown Cleveland", { neighborhood: "Downtown Cleveland", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Ohio City", { neighborhood: "Ohio City", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Tremont", { neighborhood: "Tremont", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["University Circle", { neighborhood: "University Circle", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Gordon Square", { neighborhood: "Gordon Square", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Kamm's Corners", { neighborhood: "Kamm's Corners", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Edgewater", { neighborhood: "Edgewater", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["West Park", { neighborhood: "West Park", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Old Brooklyn", { neighborhood: "Old Brooklyn", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Collinwood", { neighborhood: "Collinwood", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Detroit Shoreway", { neighborhood: "Detroit Shoreway", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Shaker Heights", { neighborhood: "Shaker Heights", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Cleveland Heights", { neighborhood: "Cleveland Heights", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Lakewood", { neighborhood: "Lakewood", city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Little Italy", { neighborhood: "Little Italy", city: "Cleveland", state: "Ohio", stateCode: "OH" }],

  // Cincinnati neighborhoods
  ["Over-the-Rhine", { neighborhood: "Over-the-Rhine", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Downtown Cincinnati", { neighborhood: "Downtown Cincinnati", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Hyde Park", { neighborhood: "Hyde Park", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Mount Adams", { neighborhood: "Mount Adams", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Oakley", { neighborhood: "Oakley", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Clifton", { neighborhood: "Clifton", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["West End", { neighborhood: "West End", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Northside", { neighborhood: "Northside", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Walnut Hills", { neighborhood: "Walnut Hills", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Columbia-Tusculum", { neighborhood: "Columbia-Tusculum", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Madisonville", { neighborhood: "Madisonville", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Mount Washington", { neighborhood: "Mount Washington", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Avondale", { neighborhood: "Avondale", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["East Price Hill", { neighborhood: "East Price Hill", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["West Price Hill", { neighborhood: "West Price Hill", city: "Cincinnati", state: "Ohio", stateCode: "OH" }],

  // Dayton neighborhoods
  ["Downtown Dayton", { neighborhood: "Downtown Dayton", city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["Oregon District", { neighborhood: "Oregon District", city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["St. Anne's Hill", { neighborhood: "St. Anne's Hill", city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["South Park", { neighborhood: "South Park", city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["Wright-Dunbar", { neighborhood: "Wright-Dunbar", city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["Oakwood", { neighborhood: "Oakwood", city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["Belmont", { neighborhood: "Belmont", city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["Kettering", { neighborhood: "Kettering", city: "Dayton", state: "Ohio", stateCode: "OH" }],

  // Akron neighborhoods
  ["Downtown Akron", { neighborhood: "Downtown Akron", city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["Highland Square", { neighborhood: "Highland Square", city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["West Hill", { neighborhood: "West Hill", city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["North Hill", { neighborhood: "North Hill", city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["Merriman Valley", { neighborhood: "Merriman Valley", city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["Fairlawn Heights", { neighborhood: "Fairlawn Heights", city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["Ellet", { neighborhood: "Ellet", city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["Goodyear Heights", { neighborhood: "Goodyear Heights", city: "Akron", state: "Ohio", stateCode: "OH" }],

  // Toledo neighborhoods
  ["Downtown Toledo", { neighborhood: "Downtown Toledo", city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["Old West End", { neighborhood: "Old West End", city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["Warehouse District", { neighborhood: "Warehouse District", city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["Point Place", { neighborhood: "Point Place", city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["Ottawa Hills", { neighborhood: "Ottawa Hills", city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["Reynolds Corners", { neighborhood: "Reynolds Corners", city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["West Toledo", { neighborhood: "West Toledo", city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["South Toledo", { neighborhood: "South Toledo", city: "Toledo", state: "Ohio", stateCode: "OH" }]
]);

// Flat map: City -> State info
export const CITY_TO_STATE = new Map<string, Omit<LocationInfo, 'neighborhood'>>([
  ["Columbus", { city: "Columbus", state: "Ohio", stateCode: "OH" }],
  ["Cleveland", { city: "Cleveland", state: "Ohio", stateCode: "OH" }],
  ["Cincinnati", { city: "Cincinnati", state: "Ohio", stateCode: "OH" }],
  ["Dayton", { city: "Dayton", state: "Ohio", stateCode: "OH" }],
  ["Akron", { city: "Akron", state: "Ohio", stateCode: "OH" }],
  ["Toledo", { city: "Toledo", state: "Ohio", stateCode: "OH" }],
  ["Canton", { city: "Canton", state: "Ohio", stateCode: "OH" }],
  ["Youngstown", { city: "Youngstown", state: "Ohio", stateCode: "OH" }],
  ["Parma", { city: "Parma", state: "Ohio", stateCode: "OH" }],
  ["Lorain", { city: "Lorain", state: "Ohio", stateCode: "OH" }]
]);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get full location info from a neighborhood name
 * @param neighborhood - The neighborhood name
 * @returns Location object or undefined if not found
 */
export function getLocationFromNeighborhood(neighborhood: string): LocationInfo | undefined {
  return NEIGHBORHOOD_TO_LOCATION.get(neighborhood);
}

/**
 * Get state info from a city name
 * @param city - The city name
 * @returns State info object or undefined if not found
 */
export function getStateFromCity(city: string): Omit<LocationInfo, 'neighborhood'> | undefined {
  return CITY_TO_STATE.get(city);
}

/**
 * Check if a neighborhood is valid (exists in our data)
 * @param neighborhood - The neighborhood name
 * @returns true if neighborhood exists
 */
export function isValidNeighborhood(neighborhood: string): boolean {
  return NEIGHBORHOOD_TO_LOCATION.has(neighborhood);
}

/**
 * Check if a city is valid (exists in our data)
 * @param city - The city name
 * @returns true if city exists
 */
export function isValidCity(city: string): boolean {
  return CITY_TO_STATE.has(city);
}

/**
 * Check if a neighborhood belongs to a specific city
 * @param neighborhood - The neighborhood name
 * @param city - The city name
 * @returns true if neighborhood is in the specified city
 */
export function isNeighborhoodInCity(neighborhood: string, city: string): boolean {
  const location = NEIGHBORHOOD_TO_LOCATION.get(neighborhood);
  return location?.city === city;
}

/**
 * Get all neighborhoods for a specific city
 * @param city - The city name
 * @returns Array of neighborhood names
 */
export function getNeighborhoodsForCity(city: string): string[] {
  const neighborhoods: string[] = [];

  NEIGHBORHOOD_TO_LOCATION.forEach((location, neighborhood) => {
    if (location.city === city) {
      neighborhoods.push(neighborhood);
    }
  });

  return neighborhoods.sort();
}

/**
 * Get all cities in a specific state
 * @param stateCode - The state code (e.g., "OH")
 * @returns Array of city names
 */
export function getCitiesInState(stateCode: string): string[] {
  const cities: string[] = [];

  CITY_TO_STATE.forEach((location, city) => {
    if (location.stateCode === stateCode) {
      cities.push(city);
    }
  });

  return cities.sort();
}

/**
 * Get all neighborhoods in a specific state
 * @param stateCode - The state code (e.g., "OH")
 * @returns Array of neighborhood names
 */
export function getNeighborhoodsInState(stateCode: string): string[] {
  const neighborhoods: string[] = [];

  NEIGHBORHOOD_TO_LOCATION.forEach((location, neighborhood) => {
    if (location.stateCode === stateCode) {
      neighborhoods.push(neighborhood);
    }
  });

  return neighborhoods.sort();
}

/**
 * Get full hierarchy: State -> Cities -> Neighborhoods
 * @param stateCode - The state code (e.g., "OH")
 * @returns Object with state info and organized cities/neighborhoods
 */
export function getStateHierarchy(stateCode: string): StateHierarchy | null {
  const cities = getCitiesInState(stateCode);

  if (cities.length === 0) {
    return null;
  }

  const stateInfo = CITY_TO_STATE.get(cities[0]);

  const hierarchy: StateHierarchy = {
    state: stateInfo?.state || '',
    stateCode,
    cities: cities.map(city => ({
      city,
      neighborhoods: getNeighborhoodsForCity(city)
    }))
  };

  return hierarchy;
}

/**
 * Search for neighborhoods by partial name
 * @param searchTerm - Partial neighborhood name
 * @param city - Optional city filter
 * @returns Array of matching neighborhood names
 */
export function searchNeighborhoods(searchTerm: string, city?: string): string[] {
  const normalizedSearch = searchTerm.toLowerCase();
  const results: string[] = [];

  NEIGHBORHOOD_TO_LOCATION.forEach((location, neighborhood) => {
    if (neighborhood.toLowerCase().includes(normalizedSearch)) {
      if (!city || location.city === city) {
        results.push(neighborhood);
      }
    }
  });

  return results.sort();
}

/**
 * Get metro area information with consistent API interface
 * @param input Lookup parameters
 * @returns Metro area data or error
 */
export async function getMetroAreaInfo(
  input: MetroAreaLookupInput
): Promise<FunctionResult<MetroAreaLookupOutput>> {
  const startTime = Date.now();

  try {
    let result: MetroAreaLookupOutput = {};

    switch (input.lookupType) {
      case 'neighborhood':
        if (!input.neighborhood) {
          return {
            success: false,
            error: 'Neighborhood name is required for neighborhood lookup',
            errorCode: 'VALIDATION_ERROR'
          };
        }
        const locationInfo = getLocationFromNeighborhood(input.neighborhood);
        if (!locationInfo) {
          return {
            success: false,
            error: `Neighborhood "${input.neighborhood}" not found in database`,
            errorCode: 'NOT_FOUND'
          };
        }
        result.locationInfo = locationInfo;
        result.isValid = true;
        break;

      case 'city':
        if (!input.city) {
          return {
            success: false,
            error: 'City name is required for city lookup',
            errorCode: 'VALIDATION_ERROR'
          };
        }
        const neighborhoods = getNeighborhoodsForCity(input.city);
        if (neighborhoods.length === 0) {
          return {
            success: false,
            error: `City "${input.city}" not found or has no neighborhoods in database`,
            errorCode: 'NOT_FOUND'
          };
        }
        result.neighborhoods = neighborhoods;
        result.isValid = isValidCity(input.city);
        break;

      case 'state':
        if (!input.stateCode) {
          return {
            success: false,
            error: 'State code is required for state lookup',
            errorCode: 'VALIDATION_ERROR'
          };
        }
        result.cities = getCitiesInState(input.stateCode);
        result.neighborhoods = getNeighborhoodsInState(input.stateCode);
        result.isValid = result.cities.length > 0;
        break;

      case 'hierarchy':
        if (!input.stateCode) {
          return {
            success: false,
            error: 'State code is required for hierarchy lookup',
            errorCode: 'VALIDATION_ERROR'
          };
        }
        const hierarchy = getStateHierarchy(input.stateCode);
        if (!hierarchy) {
          return {
            success: false,
            error: `State "${input.stateCode}" not found in database`,
            errorCode: 'NOT_FOUND'
          };
        }
        result.hierarchy = hierarchy;
        result.isValid = true;
        break;

      default:
        return {
          success: false,
          error: 'Invalid lookup type. Must be one of: neighborhood, city, state, hierarchy',
          errorCode: 'VALIDATION_ERROR'
        };
    }

    return {
      success: true,
      data: result,
      metadata: {
        apiCalls: 0, // No API calls for static data
        executionTime: Date.now() - startTime,
        cacheHit: true // Always cache hit since it's static data
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode: 'INTERNAL_ERROR',
      metadata: {
        apiCalls: 0,
        executionTime: Date.now() - startTime
      }
    };
  }
}