/**
 * Apartment Search Function
 * Searches for apartment units matching specified criteria
 *
 * @input neighborhood (optional), city, state, bed_count, bath_count
 * @output addresses
 * @dependencies Can optionally use neighborhood from getNeighborhoodName()
 */

import { PerplexityClient } from '../common';
import {
  FunctionResult,
  ApartmentCompInput,
  ApartmentCompOutput
} from '../propertyDataGather/types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        addresses: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["addresses"]
    }
  }
};

/**
 * Search for apartment units matching criteria
 * @param client PerplexityClient instance
 * @param input Location and unit specifications
 * @returns List of apartment addresses or error
 */
export async function getApartmentComps(
  client: PerplexityClient,
  input: ApartmentCompInput
): Promise<FunctionResult<ApartmentCompOutput>> {
  const startTime = Date.now();

  try {
    // Validate input
    if (!input.city || !input.state || !input.bed_count || !input.bath_count) {
      return {
        success: false,
        error: 'City, state, bed count, and bath count are required',
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Build location string based on whether neighborhood is provided
    const location = input.neighborhood
      ? `${input.neighborhood}, ${input.city}, ${input.state}`
      : `${input.city}, ${input.state}`;

    // Build the prompt
    const userPrompt = `I need you to look for places to rent in ${location}. Please look for units with ${input.bed_count} bedroom and ${input.bath_count} bathroom. I am looking for units at residential addresses (not apartment buildings). Please list all the addresses you can find in an array.`;

    // Make the API call with sonar-pro for better results
    const response = await client.chat({
      model: 'sonar-pro',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPrompt,
      searchContextSize: 'high',
      jsonSchema: JSON_SCHEMA,
      searchDomainFilter: ['redfin.com', 'apartments.com', 'zillow.com']
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
          model: 'sonar-pro',
          searchDomains: ['redfin.com', 'apartments.com', 'zillow.com']
        }
      };
    }

    // Validate the response data
    const data = response.data as ApartmentCompOutput;
    if (!data || !data.addresses) {
      return {
        success: false,
        error: 'Unable to find apartment listings matching the specified criteria',
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar-pro',
          searchDomains: ['redfin.com', 'apartments.com', 'zillow.com']
        }
      };
    }

    // Return successful result
    return {
      success: true,
      data: data,
      metadata: {
        apiCalls: 1,
        executionTime: Date.now() - startTime,
        model: 'sonar-pro',
        searchDomains: ['redfin.com', 'apartments.com', 'zillow.com']
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