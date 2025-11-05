/**
 * County Lookup Function
 * Determines the county name for a given city and state
 *
 * @input city_name, state_name
 * @output county_name
 * @dependencies None
 */

import { PerplexityClient } from '../common';
import {
  FunctionResult,
  CountyNameInput,
  CountyNameOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        county_name: { type: "string" }
      },
      required: ["county_name"]
    }
  }
};

/**
 * Get the county name for a given city and state
 * @param client PerplexityClient instance
 * @param input City and state information
 * @returns County name or error
 */
export async function getCountyName(
  client: PerplexityClient,
  input: CountyNameInput
): Promise<FunctionResult<CountyNameOutput>> {
  const startTime = Date.now();

  try {
    // Validate input
    if (!input.city_name || !input.state_name) {
      return {
        success: false,
        error: 'City name and state name are required',
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Build the prompt
    const userPrompt = `What county is ${input.city_name} ${input.state_name} in? Just provide me with the county name`;

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
    const data = response.data as CountyNameOutput;
    if (!data || !data.county_name) {
      return {
        success: false,
        error: 'Unable to find county information for the specified location',
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar'
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