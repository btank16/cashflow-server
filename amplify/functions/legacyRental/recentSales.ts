/**
 * Recent Sales Info Function
 * Gets recent sale date and price for a property
 *
 * @input street, city, state, zip
 * @output sale_date, sale_price
 * @dependencies None
 */

import { PerplexityClient } from '../common';
import {
  FunctionResult,
  RecentSaleInfoInput,
  RecentSaleInfoOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        sale_date: { type: "string" },
        sale_price: { type: "number" }
      },
      required: ["sale_date", "sale_price"]
    }
  }
};

/**
 * Get recent sale information for a property
 * @param client PerplexityClient instance
 * @param input Address information
 * @returns Sale date and price or error
 */
export async function getRecentSaleInfo(
  client: PerplexityClient,
  input: RecentSaleInfoInput
): Promise<FunctionResult<RecentSaleInfoOutput>> {
  const startTime = Date.now();

  try {
    // Validate input
    const requiredFields = ['street', 'city', 'state', 'zip'];
    const missingFields = requiredFields.filter(field => !input[field as keyof RecentSaleInfoInput]);

    if (missingFields.length > 0) {
      return {
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Build the prompt
    const userPrompt = `I need you to look into price and sale history for the property at: ${input.street}, ${input.city}, ${input.state} ${input.zip}. Please provide me with the date the property sold (mm-dd-yyyy) and the sale price. If the property is currently for sale, reply with "for sale" as the sale date.`;

    // Make the API call
    const response = await client.chat({
      model: 'sonar',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPrompt,
      searchContextSize: 'low',
      jsonSchema: JSON_SCHEMA,
      searchDomainFilter: ['realtor.com', 'redfin.com']
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
          searchDomains: ['realtor.com', 'redfin.com']
        }
      };
    }

    // Validate the response data
    const data = response.data as RecentSaleInfoOutput;
    if (!data || !data.sale_date || typeof data.sale_price !== 'number') {
      return {
        success: false,
        error: 'Unable to find recent sale information for the specified address',
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar',
          searchDomains: ['realtor.com', 'redfin.com']
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
        searchDomains: ['realtor.com', 'redfin.com']
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