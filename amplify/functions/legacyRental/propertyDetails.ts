/**
 * Property Details Function
 * Gets detailed property information including units, square footage, beds, and baths
 *
 * @input street, city, state, zip, county_name
 * @output total_units, total_sq_ft, total_beds, total_bath, unit details arrays
 * @dependencies Requires county_name from getCountyName()
 */

import { PerplexityClient } from '../common';
import {
  FunctionResult,
  InitialPropertyInfoInput,
  InitialPropertyInfoOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        total_units: { type: "number" },
        total_sq_ft: { type: "number" },
        total_beds: { type: "number" },
        total_bath: { type: "number" },
        unit_sq_ft: {
          type: "array",
          items: { type: "number" }
        },
        unit_bed: {
          type: "array",
          items: { type: "number" }
        },
        unit_bath: {
          type: "array",
          items: { type: "number" }
        }
      },
      required: ["total_units", "total_sq_ft", "total_beds", "total_bath", "unit_sq_ft", "unit_bed", "unit_bath"]
    }
  }
};

/**
 * Internal function to fetch and validate property information (single attempt)
 * @param client PerplexityClient instance
 * @param input Address and county information
 * @param startTime Start time for tracking execution
 * @returns Property details or error
 */
async function fetchAndValidatePropertyInfo(
  client: PerplexityClient,
  input: InitialPropertyInfoInput,
  startTime: number
): Promise<FunctionResult<InitialPropertyInfoOutput>> {
  try {
    // Build the prompt
    const userPrompt = `I need you to find property information on the home at ${input.street}, ${input.city}, ${input.state} ${input.zip}. Please search online real estate sites and the ${input.county_name} county website where public information is posted on properties. I need you to find the following information and present it in json format: number of units, total square footage, total beds, total baths, square footage of each unit, bedrooms in each unit, and bathrooms in each unit.`;

    // Make the API call
    const response = await client.chat({
      model: 'sonar',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPrompt,
      searchContextSize: 'low',
      jsonSchema: JSON_SCHEMA
    });

    // Check if the API call was successful
    if (!response.success) {
      return {
        success: false,
        error: response.error || 'Failed to get response from Perplexity API',
        errorCode: 'API_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar'
        }
      };
    }

    // Validate the response data
    const data = response.data as InitialPropertyInfoOutput;
    if (!data || typeof data.total_units !== 'number') {
      return {
        success: false,
        error: 'Unable to find property information for the specified address',
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar'
        }
      };
    }

    // Validate array lengths match total_units
    if (data.unit_bed.length !== data.total_units) {
      return {
        success: false,
        error: `Data validation failed: unit_bed array length (${data.unit_bed.length}) does not match total_units (${data.total_units})`,
        errorCode: 'DATA_VALIDATION_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar'
        }
      };
    }

    if (data.unit_bath.length !== data.total_units) {
      return {
        success: false,
        error: `Data validation failed: unit_bath array length (${data.unit_bath.length}) does not match total_units (${data.total_units})`,
        errorCode: 'DATA_VALIDATION_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar'
        }
      };
    }

    // Validate bedroom sum matches total_beds
    const sumBedrooms = data.unit_bed.reduce((sum, beds) => sum + beds, 0);
    if (sumBedrooms !== data.total_beds) {
      return {
        success: false,
        error: `Data validation failed: sum of unit_bed (${sumBedrooms}) does not match total_beds (${data.total_beds})`,
        errorCode: 'DATA_VALIDATION_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar'
        }
      };
    }

    // Validate bathroom sum matches total_bath
    const sumBathrooms = data.unit_bath.reduce((sum, baths) => sum + baths, 0);
    if (sumBathrooms !== data.total_bath) {
      return {
        success: false,
        error: `Data validation failed: sum of unit_bath (${sumBathrooms}) does not match total_bath (${data.total_bath})`,
        errorCode: 'DATA_VALIDATION_ERROR',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar'
        }
      };
    }

    // Validate and fix square footage
    let needsSquareFootageFix = false;

    // Check if unit_sq_ft array length matches total_units
    if (data.unit_sq_ft.length !== data.total_units) {
      needsSquareFootageFix = true;
    } else {
      // Check if sum of unit_sq_ft is within +/- 10% of total_sq_ft
      const sumSquareFeet = data.unit_sq_ft.reduce((sum, sqft) => sum + sqft, 0);
      const lowerBound = data.total_sq_ft * 0.9;
      const upperBound = data.total_sq_ft * 1.1;

      if (sumSquareFeet < lowerBound || sumSquareFeet > upperBound) {
        needsSquareFootageFix = true;
      }
    }

    // If square footage validation failed, distribute using hybrid approach
    if (needsSquareFootageFix) {
      const totalBedrooms = data.unit_bed.reduce((sum, beds) => sum + beds, 0);

      // Split total_sq_ft in half
      const halfSquareFeet = data.total_sq_ft / 2;

      // First half: distribute evenly among all units
      const evenShare = halfSquareFeet / data.total_units;

      // Second half: distribute proportionally by bedroom count
      data.unit_sq_ft = data.unit_bed.map(beds => {
        const bedroomProportion = beds / totalBedrooms;
        const bedroomShare = halfSquareFeet * bedroomProportion;
        return Math.round(evenShare + bedroomShare);
      });
    }

    // Return successful result
    return {
      success: true,
      data: data,
      metadata: {
        apiCalls: 1,
        executionTime: Date.now() - startTime,
        model: 'sonar',
        searchDomains: [] // No domain filter used
      }
    };

  } catch (error) {
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
 * Get detailed property information with retry logic for validation errors
 * @param client PerplexityClient instance
 * @param input Address and county information
 * @returns Property details or error
 */
export async function getInitialPropertyInfo(
  client: PerplexityClient,
  input: InitialPropertyInfoInput
): Promise<FunctionResult<InitialPropertyInfoOutput>> {
  const startTime = Date.now();

  // Validate input
  const requiredFields = ['street', 'city', 'state', 'zip', 'county_name'];
  const missingFields = requiredFields.filter(field => !input[field as keyof InitialPropertyInfoInput]);

  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`,
      errorCode: 'VALIDATION_ERROR'
    };
  }

  // First attempt
  let result = await fetchAndValidatePropertyInfo(client, input, startTime);

  // If validation error, retry once
  if (!result.success && result.errorCode === 'DATA_VALIDATION_ERROR') {
    result = await fetchAndValidatePropertyInfo(client, input, startTime);

    // Update metadata to reflect total API calls (2 attempts)
    if (result.metadata) {
      result.metadata.apiCalls = 2;
      result.metadata.executionTime = Date.now() - startTime;
    }

    // If still failed, add note about retry
    if (!result.success && result.errorCode === 'DATA_VALIDATION_ERROR') {
      result.error = `${result.error} (failed after retry)`;
    }
  }

  return result;
}