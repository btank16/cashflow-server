/**
 * Similar Areas Function
 * Finds similar neighborhoods within a city OR similar cities within a county
 * based on socioeconomic factors and demographics
 *
 * @dependencies If neighborhood is provided, it should come from getNeighborhoodName()
 * @dependencies If county_name is needed, it should come from getCountyName()
 */

import { PerplexityClient } from '../../common';
import {
  FunctionResult,
  SimilarAreasInput,
  SimilarAreasOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        similar_neighborhoods: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["similar_neighborhoods"]
    }
  }
};

/**
 * Find similar areas - either neighborhoods within a city or cities within a county
 * Dynamically adjusts based on whether neighborhood is provided
 *
 * @param client PerplexityClient instance
 * @param input Location information with optional neighborhood
 * @returns List of similar areas or error
 */
export async function getSimilarAreas(
  client: PerplexityClient,
  input: SimilarAreasInput
): Promise<FunctionResult<SimilarAreasOutput>> {
  const startTime = Date.now();

  try {
    // Determine which mode we're in based on neighborhood presence
    const isNeighborhoodMode = !!input.neighborhood;

    // Validate input based on mode
    if (isNeighborhoodMode) {
      // Neighborhood comparison mode
      if (!input.city || !input.state || !input.neighborhood) {
        return {
          success: false,
          error: 'City, state, and neighborhood are required for neighborhood comparison',
          errorCode: 'VALIDATION_ERROR'
        };
      }
    } else {
      // City comparison mode - use alternative field names if provided
      const countyName = input.county_name;
      const cityName = input.city_name || input.city;
      const stateName = input.state_name || input.state;

      if (!countyName || !cityName || !stateName) {
        return {
          success: false,
          error: 'County name, city name, and state name are required for city comparison',
          errorCode: 'VALIDATION_ERROR'
        };
      }
    }

    // Build the prompt based on mode (keeping legacy format exactly)
    let userPrompt: string;

    if (isNeighborhoodMode) {
      // Neighborhood comparison prompt (legacy format)
      userPrompt = `I need you to review the socioeconomic and demographic data of ${input.city} ${input.state}. Please also review each individual neighborhood of ${input.city} ${input.state} as well. Please tell me the two neighborhoods that are similar in socioeconomic status and demographics as the ${input.neighborhood} neighborhood.`;
    } else {
      // City comparison prompt (legacy format)
      const countyName = input.county_name;
      const cityName = input.city_name || input.city;
      const stateName = input.state_name || input.state;

      userPrompt = `I need you to review the socioeconomic and demographic data of ${countyName} ${stateName}. Please also review each individual city of ${countyName} as well. Please tell me the two cities that are similar in socioeconomic status and demographics as ${cityName}.`;
    }

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
          model: 'sonar',
          searchMode: isNeighborhoodMode ? 'neighborhood' : 'city'
        }
      };
    }

    // Validate the response data - the API returns similar_neighborhoods field
    const data = response.data as any;
    if (!data || !data.similar_neighborhoods) {
      const errorMessage = isNeighborhoodMode
        ? 'Unable to find similar neighborhoods for comparison'
        : 'Unable to find similar areas for comparison';

      return {
        success: false,
        error: errorMessage,
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar',
          searchMode: isNeighborhoodMode ? 'neighborhood' : 'city'
        }
      };
    }

    // Return successful result - map the API response to our output format
    return {
      success: true,
      data: {
        similar_areas: data.similar_neighborhoods
      },
      metadata: {
        apiCalls: 1,
        executionTime: Date.now() - startTime,
        model: 'sonar',
        searchDomains: [],
        searchMode: isNeighborhoodMode ? 'neighborhood' : 'city'
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