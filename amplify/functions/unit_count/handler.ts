import { Schema } from '../../data/resource';

// Define the JSON schema for unit count extraction
const unitCountSchema = {
  "type": "object",
  "properties": {
    "unit_count": {
      "type": "integer",
      "description": "The number of units at this address"
    }
  },
  "required": ["unit_count"]
};

export const handler: Schema['getUnitCount']['functionHandler'] = async (event) => {
  try {
    // Extract address from GraphQL arguments
    const { address } = event.arguments;

    // Validate input
    if (!address) {
      throw new Error('Address is required');
    }

    // Get API key from environment
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('PERPLEXITY_API_KEY not found in environment');
      throw new Error('API configuration error');
    }

    // Prepare the Perplexity API request
    const perplexityUrl = 'https://api.perplexity.ai/chat/completions';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    // Create the prompt for unit count extraction
    const prompt = `I need you to find infomation about the property at ${address}. Please find the number of residential units at this address. If it's a single-family home, the unit count is 1. Return ONLY the number as an integer.`;


    // Prepare the request payload
    const payload = {
      model: 'sonar',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'unit_count_response',
          schema: unitCountSchema
        }
      }
    };

    // Make the API call
    const response = await fetch(perplexityUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
      throw new Error('Failed to fetch unit count information');
    }

    const data = await response.json();

    // Extract the JSON response from Perplexity
    const unitInfo = JSON.parse(data.choices[0].message.content);

    // Return only the unit count as an integer
    return unitInfo.unit_count;

  } catch (error) {
    console.error('Error in unit count function:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error');
  }
};