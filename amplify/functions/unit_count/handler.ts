import { Schema } from '../../data/resource';

// Define the JSON schema for unit count extraction
const unitCountSchema = {
  "type": "object",
  "properties": {
    "unit_count": {
      "type": "integer",
      "description": "The number of units at this address"
    },
    "bedrooms": {
      "type": "array",
      "items": {
        "type": "integer",
        "description": "Number of bedrooms per unit (0 for studio, null if unknown)"
      },
      "description": "Array of bedroom counts for each unit"
    },
    "bathrooms": {
      "type": "array",
      "items": {
        "type": "number",
        "description": "Number of bathrooms per unit (can be decimal, null if unknown)"
      },
      "description": "Array of bathroom counts for each unit"
    },
    "square_feet": {
      "type": "array",
      "items": {
        "type": "integer",
        "description": "Square footage per unit (null if unknown)"
      },
      "description": "Array of square footages for each unit"
    }
  },
  "required": ["unit_count", "bedrooms", "bathrooms", "square_feet"]
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
    const prompt = `I need you to find infomation about the property at ${address}. Please find the number of residential units at this address. If it's a single-family home, the unit count is 1. Once you find the number of units please find the number of bedrooms, bathrooms, and square feet in each unit. If a unit is a studio, please make the number of bedrooms 0. Please return the information in json format, as defined.`;


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

    // Return the complete unit information
    return {
      unit_count: unitInfo.unit_count,
      bedrooms: unitInfo.bedrooms || [],
      bathrooms: unitInfo.bathrooms || [],
      square_feet: unitInfo.square_feet || []
    };

  } catch (error) {
    console.error('Error in unit count function:', error);
    throw new Error(error instanceof Error ? error.message : 'Unknown error');
  }
};