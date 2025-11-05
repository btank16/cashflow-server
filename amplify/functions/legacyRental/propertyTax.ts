/**
 * Property Tax Lookup Function
 * Gets annual property tax information from Realtor.com
 *
 * @input street, city, state, zip, year
 * @output annual_taxes
 * @dependencies None
 */

import { PerplexityClient } from '../common';
import {
  FunctionResult,
  PropertyTaxRealtorInput,
  PropertyTaxRealtorOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        annual_taxes: { type: "number" }
      },
      required: ["annual_taxes"]
    }
  }
};

/**
 * Get annual property tax for a given address
 * @param client PerplexityClient instance
 * @param input Address and year information
 * @returns Annual tax amount or error
 */
export async function getPropertyTax(
  client: PerplexityClient,
  input: PropertyTaxRealtorInput
): Promise<FunctionResult<PropertyTaxRealtorOutput>> {
  const startTime = Date.now();

  try {
    // Validate input
    const requiredFields = ['street', 'city', 'state', 'zip', 'year'];
    const missingFields = requiredFields.filter(field => !input[field as keyof PropertyTaxRealtorInput]);

    if (missingFields.length > 0) {
      return {
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Build the prompt
    const userPrompt = `I need you to look into the property history at a home in ${input.city} ${input.state}. Please find the ${input.year} taxes for the property at the following address: ${input.street}, ${input.city}, ${input.state} ${input.zip}`;

    // Make the API call
    const response = await client.chat({
      model: 'sonar',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPrompt,
      searchContextSize: 'low',
      jsonSchema: JSON_SCHEMA,
      searchDomainFilter: ['realtor.com']
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
          searchDomains: ['realtor.com']
        }
      };
    }

    // Validate the response data
    const data = response.data as PropertyTaxRealtorOutput;
    if (!data || typeof data.annual_taxes !== 'number') {
      return {
        success: false,
        error: 'Unable to find property tax information for the specified address',
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar',
          searchDomains: ['realtor.com']
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
        searchDomains: ['realtor.com']
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