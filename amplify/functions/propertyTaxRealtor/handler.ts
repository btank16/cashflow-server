import {
  PerplexityClient,
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

export interface PropertyTaxRealtorInput {
  street: string;
  city: string;
  state: string;
  zip: string;
  year: number;
}

export interface PropertyTaxRealtorOutput {
  annual_taxes: number;
}

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        annual_taxes: {
          type: "number"
        }
      },
      required: ["annual_taxes"]
    }
  }
};

export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: PropertyTaxRealtorInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['street', 'city', 'state', 'zip', 'year']);
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
    const userPrompt = `I need you to look into the property history at a home in ${input.city} ${input.state}. Please find the ${input.year} taxes for the property at the following address: ${input.street}, ${input.city}, ${input.state} ${input.zip}`;

    // Make the API call with retry logic
    const response = await retryWithBackoff(async () => {
      return await client.chat({
        model: 'sonar',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPrompt,
        searchContextSize: 'low',
        jsonSchema: JSON_SCHEMA,
        searchDomainFilter: ['realtor.com']
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
    const data = response.data as PropertyTaxRealtorOutput;
    if (!data || data.annual_taxes === undefined) {
      return createErrorResponse(
        'Unable to find tax information for the specified property',
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