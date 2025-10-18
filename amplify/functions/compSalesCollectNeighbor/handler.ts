import {
  PerplexityClient,
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

export interface CompSalesCollectNeighborInput {
  street: string;
  city: string;
  state: string;
  zip: string;
  neighborhood: string;
  property_type: string;
}

export interface CompSalesCollectNeighborOutput {
  addresses: string[];
}

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

export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: CompSalesCollectNeighborInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['street', 'city', 'state', 'zip', 'neighborhood', 'property_type']);
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
    const userPrompt = `I am looking to purchase a ${input.property_type} home at ${input.street}, ${input.city}, ${input.state} ${input.zip}. I need you to find a comparable ${input.property_type} properties that have sold recently in ${input.neighborhood}, ${input.city}, ${input.state}. Please note the difference between properties for sale and properties that have sold. Provide the address of all the properties that you can find in an array.`;

    // Make the API call with retry logic - using sonar-pro for this complex query
    const response = await retryWithBackoff(async () => {
      return await client.chat({
        model: 'sonar',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPrompt,
        searchContextSize: 'low',
        jsonSchema: JSON_SCHEMA,
        searchDomainFilter: ['zillow.com']
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
    const data = response.data as CompSalesCollectNeighborOutput;
    if (!data || !data.addresses) {
      return createErrorResponse(
        'Unable to find comparable sales in the specified neighborhood',
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
