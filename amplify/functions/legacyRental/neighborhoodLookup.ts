/**
 * Neighborhood Lookup Function
 * Determines the neighborhood name for a given address
 *
 * @input street, city, state, zip
 * @output neighborhood
 * @dependencies None
 */

import { PerplexityClient } from '../common';
import {
  FunctionResult,
  NeighborhoodNameInput,
  NeighborhoodNameOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        neighborhood: { type: "string" }
      },
      required: ["neighborhood"]
    }
  }
};

/**
 * Get the neighborhood name for a given address
 * @param client PerplexityClient instance
 * @param input Address information
 * @returns Neighborhood name or error
 */
export async function getNeighborhoodName(
  client: PerplexityClient,
  input: NeighborhoodNameInput
): Promise<FunctionResult<NeighborhoodNameOutput>> {
  const startTime = Date.now();

  try {
    // Validate input
    if (!input.street || !input.city || !input.state || !input.zip) {
      return {
        success: false,
        error: 'Street, city, state, and zip are required',
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Build the prompt
    const userPrompt = `I need you to tell me what neighborhood of ${input.city} ${input.state} the following address is in: ${input.street}, ${input.city}, ${input.state} ${input.zip}. Please provide only the neighborhood name in your response`;

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
    const data = response.data as NeighborhoodNameOutput;
    if (!data || !data.neighborhood) {
      return {
        success: false,
        error: 'Unable to find neighborhood information for the specified address',
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
        searchDomains: ['zillow.com']
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