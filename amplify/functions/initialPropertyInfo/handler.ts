import {
  PerplexityClient,
  validateInput,
  createErrorResponse,
  createSuccessResponse,
  retryWithBackoff
} from '../common';

export interface InitialPropertyInfoInput {
  street: string;
  city: string;
  state: string;
  zip: string;
  county_name: string;
}

export interface InitialPropertyInfoOutput {
  total_units: number;
  total_sq_ft: number;
  total_beds: number;
  total_bath: number;
  unit_sq_ft: number[];
  unit_bed: number[];
  unit_bath: number[];
}

const SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.";

const JSON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    schema: {
      type: "object",
      properties: {
        total_units: { type: "number" },
        total_sq_ft: { type: "number" },
        total_beds: { type: "number" },
        total_bath: { type: "number" },
        unit_sq_ft: {
          type: "array",
          items: { type: "number" }
        },
        unit_bed: {
          type: "array",
          items: { type: "number" }
        },
        unit_bath: {
          type: "array",
          items: { type: "number" }
        }
      },
      required: ["total_units", "total_sq_ft", "total_beds", "total_bath", "unit_sq_ft", "unit_bed", "unit_bath"]
    }
  }
};

export const handler = async (event: any) => {
  try {
    // Parse the input
    const input: InitialPropertyInfoInput = typeof event === 'string' ? JSON.parse(event) : event;

    // Validate required fields
    const validation = validateInput(input, ['street', 'city', 'state', 'zip', 'county_name']);
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
    const userPrompt = `I need you to find property information on the home at ${input.street}, ${input.city}, ${input.state} ${input.zip}. Please search online real estate sites and the ${input.county_name} county website where public information is posted on properties. I need you to find the following information and present it in json format: number of units, total square footage, total beds, total baths, square footage of each unit, bedrooms in each unit, and bathrooms in each unit.`;

    // Make the API call with retry logic - using sonar-pro for this complex query
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
    const data = response.data as InitialPropertyInfoOutput;
    if (!data) {
      return createErrorResponse(
        'Unable to find property information for the specified address',
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