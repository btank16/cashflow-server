import {
  PerplexityClient,
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

export interface InterestRateFinalInput {
  state_name: string;
  down_payment: number;
  loan_type: string;
}

export interface InterestRateFinalOutput {
  interest_rate: number;
}

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        interest_rate: {
          type: "number"
        }
      },
      required: ["interest_rate"]
    }
  }
};

export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: InterestRateFinalInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['state_name', 'down_payment', 'loan_type']);
    if (!validation.isValid) {
      return createErrorResponse(
        `Missing required fields: ${validation.missingFields.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Get the API key
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return createErrorResponse('Perplexity API key not configured', 'CONFIG_ERROR');
    }

    // Initialize Perplexity client
    const client = new PerplexityClient(apiKey);

    // Build the prompt using native template literals (more efficient than regex)
    const userPrompt = `I need you to find me mortgage rates for a ${input.loan_type} mortgage in ${input.state_name}. Note that I am putting ${input.down_payment}% down as a down payment`;

    // Make the API call with retry logic
    const response = await retryWithBackoff(async () => {
      return await client.chat({
        model: 'sonar',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPrompt,
        searchContextSize: 'low',
        jsonSchema: JSON_SCHEMA,
        searchDomainFilter: ['freddiemac.com', 'nerdwallet.com', 'bankrate.com']
      });
    });

    // Check if the API call was successful
    if (!response.success) {
      return createErrorResponse(
        response.error || 'Failed to get response from Perplexity API',
        'API_ERROR'
      );
    }

    // Validate the response data
    const data = response.data as InterestRateFinalOutput;
    if (!data || !data.interest_rate) {
      return createErrorResponse(
        'Unable to find interest rate information for the specified criteria',
        'NO_DATA'
      );
    }

    // Return the successful response
    return createSuccessResponse(data);

  } catch (error) {
    console.error('Handler error:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      'INTERNAL_ERROR'
    );
  }
};
