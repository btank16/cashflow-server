import {
  PerplexityClient,
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

export interface RecentSaleInfoInput {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface RecentSaleInfoOutput {
  sale_date: string;
  sale_price: number;
}

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        sale_date: {
          type: "string"
        },
        sale_price: {
          type: "number"
        }
      },
      required: ["sale_date", "sale_price"]
    }
  }
};

export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: RecentSaleInfoInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['street', 'city', 'state', 'zip']);
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
    const userPrompt = `I need you to look into price and sale history for the property at: ${input.street}, ${input.city}, ${input.state} ${input.zip}. Please provide me with the date the property sold (mm-dd-yyyy) and the sale price. If the property is currently for sale, reply with "for sale" as the sale date.`;

    // Make the API call with retry logic
    const response = await retryWithBackoff(async () => {
      return await client.chat({
        model: 'sonar-pro',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPrompt,
        searchContextSize: 'high',
        jsonSchema: JSON_SCHEMA,
        searchDomainFilter: ['realtor.com', 'redfin.com']
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
    const data = response.data as RecentSaleInfoOutput;
    if (!data || !data.sale_date) {
      return createErrorResponse(
        'Unable to find sale information for the specified property',
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
