/**
 * Comparable Sales Function
 * Gets comparable property addresses from neighborhood or city-wide
 *
 * @dependencies If neighborhood is provided, it should come from getNeighborhoodName()
 */

import { PerplexityClient } from '../../common';
import {
  FunctionResult,
  ComparableSalesInput,
  ComparableSalesOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

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
 * Get comparable sales in a specific neighborhood or city-wide
 * Dynamically adjusts the search scope based on whether neighborhood is provided
 *
 * @param client PerplexityClient instance
 * @param input Address, property type, and optional neighborhood information
 * @returns List of comparable property addresses or error
 */
export async function getComparableSales(
  client: PerplexityClient,
  input: ComparableSalesInput
): Promise<FunctionResult<ComparableSalesOutput>> {
  const startTime = Date.now();

  try {
    // Validate required fields
    const requiredFields = ['street', 'city', 'state', 'zip', 'property_type'];
    const missingFields = requiredFields.filter(field => !input[field as keyof ComparableSalesInput]);

    if (missingFields.length > 0) {
      return {
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Build the search scope - neighborhood-specific or city-wide
    const searchScope = input.neighborhood
      ? `${input.neighborhood}, ${input.city}, ${input.state}`
      : `${input.city}, ${input.state}`;

    // Build the prompt (keeping the legacy grammar error for compatibility)
    const userPrompt = `I am looking to purchase a ${input.property_type} home at ${input.street}, ${input.city}, ${input.state} ${input.zip}. I need you to find a comparable ${input.property_type} properties that have sold recently in ${searchScope}. Please note the difference between properties for sale and properties that have sold. Provide the address of all the properties that you can find in an array.`;

    // Make the API call
    const response = await client.chat({
      model: 'sonar',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPrompt,
      searchContextSize: 'low',
      jsonSchema: JSON_SCHEMA,
      searchDomainFilter: ['zillow.com']
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
          model: 'sonar',
          searchDomains: ['zillow.com']
        }
      };
    }

    // Validate the response data
    const data = response.data as ComparableSalesOutput;
    if (!data || !data.addresses) {
      const errorMessage = input.neighborhood
        ? 'Unable to find comparable sales in the specified neighborhood'
        : 'Unable to find comparable sales in the specified city';

      return {
        success: false,
        error: errorMessage,
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar',
          searchDomains: ['zillow.com']
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
        model: 'sonar',
        searchDomains: ['zillow.com'],
        searchScope: input.neighborhood ? 'neighborhood' : 'city'
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

