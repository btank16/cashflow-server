/**
 * Interest Rate Lookup Function
 * Gets current interest rates based on state, down payment, and loan type
 *
 * @input state_name, down_payment, loan_type
 * @output interest_rate
 * @dependencies None
 */

import { PerplexityClient } from '../common';
import {
  FunctionResult,
  InterestRateFinalInput,
  InterestRateFinalOutput
} from '../types';

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        interest_rate: { type: "number" }
      },
      required: ["interest_rate"]
    }
  }
};

/**
 * Get current interest rate for a loan
 * @param client PerplexityClient instance
 * @param input State, down payment, and loan type information
 * @returns Interest rate or error
 */
export async function getInterestRate(
  client: PerplexityClient,
  input: InterestRateFinalInput
): Promise<FunctionResult<InterestRateFinalOutput>> {
  const startTime = Date.now();

  try {
    // Validate input
    if (!input.state_name || input.down_payment === undefined || !input.loan_type) {
      return {
        success: false,
        error: 'State name, down payment, and loan type are required',
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Build the prompt
    const userPrompt = `I need you to find me mortgage rates for a ${input.loan_type} mortgage in ${input.state_name}. Note that I am putting ${input.down_payment}% down as a down payment`;

    // Make the API call
    const response = await client.chat({
      model: 'sonar',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPrompt,
      searchContextSize: 'low',
      jsonSchema: JSON_SCHEMA,
      searchDomainFilter: ['freddiemac.com', 'nerdwallet.com', 'bankrate.com']
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
          searchDomains: ['freddiemac.com', 'nerdwallet.com', 'bankrate.com']
        }
      };
    }

    // Validate the response data
    const data = response.data as InterestRateFinalOutput;
    if (!data || typeof data.interest_rate !== 'number') {
      return {
        success: false,
        error: 'Unable to find interest rate information for the specified criteria',
        errorCode: 'NO_DATA',
        metadata: {
          apiCalls: 1,
          executionTime: Date.now() - startTime,
          model: 'sonar',
          searchDomains: ['freddiemac.com', 'nerdwallet.com', 'bankrate.com']
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
        searchDomains: ['freddiemac.com', 'nerdwallet.com', 'bankrate.com']
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