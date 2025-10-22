import {
  PerplexityClient,
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

export interface ApartmentCompInput {
  neighborhood?: string;
  city: string;
  state: string;
  bed_count: number | string;
  bath_count: number | string;
}

export interface ApartmentCompOutput {
  addresses: string[];
}

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

export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: ApartmentCompInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['city', 'state', 'bed_count', 'bath_count']);
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

    // Build the prompt using native template literals
    const location = input.neighborhood
      ? `${input.neighborhood}, ${input.city}, ${input.state}`
      : `${input.city}, ${input.state}`;

    const userPrompt = `I need you to look for apartments in ${location}. Please look for apartments with ${input.bed_count} bedroom and ${input.bath_count} bathroom. I am looking for apartment units at residential addresses (not apartment buildings). Please list all the addresses you can find in an array.`;

    // Make the API call with retry logic - using sonar-pro for this complex query
    const response = await retryWithBackoff(async () => {
      return await client.chat({
        model: 'sonar-pro',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPrompt,
        searchContextSize: 'high',
        jsonSchema: JSON_SCHEMA,
        searchDomainFilter: ['redfin.com', 'apartments.com', 'zillow.com']
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
    const data = response.data as ApartmentCompOutput;
    if (!data || !data.addresses) {
      return createErrorResponse(
        'Unable to find apartment listings matching the specified criteria',
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