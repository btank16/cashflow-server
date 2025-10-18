import {
  PerplexityClient,
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

export interface SocioNeighborhoodCompareInput {
  city: string;
  state: string;
  neighborhood: string;
}

export interface SocioNeighborhoodCompareOutput {
  similar_neighborhoods: string[];
}

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information";

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

export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: SocioNeighborhoodCompareInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['city', 'state', 'neighborhood']);
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
    const userPrompt = `I need you to review the socioeconomic and demographic data of ${input.city} ${input.state}. Please also review each individual neighborhood of ${input.city} ${input.state} as well. Please tell me the two neighborhoods that are similar in socioeconomic status and demographics as the ${input.neighborhood} neighborhood.`;

    // Make the API call with retry logic
    const response = await retryWithBackoff(async () => {
      return await client.chat({
        model: 'sonar',
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userPrompt,
        searchContextSize: 'low',
        jsonSchema: JSON_SCHEMA
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
    const data = response.data as SocioNeighborhoodCompareOutput;
    if (!data || !data.similar_neighborhoods) {
      return createErrorResponse(
        'Unable to find similar neighborhoods for the specified location',
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
