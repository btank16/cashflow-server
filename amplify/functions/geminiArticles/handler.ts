/**
 * Gemini Articles Handler
 *
 * Uses Google Gemini 2.0 Flash to generate structured article content
 * with a description and three questions based on system/user prompts.
 */

import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

interface GeminiArticlesArgs {
  systemPrompt: string;
  userPrompt: string;
}

interface GeminiArticlesResponse {
  success: boolean;
  description?: string;
  question_one?: string;
  question_two?: string;
  question_three?: string;
  error?: string;
}

interface LambdaEvent {
  arguments: GeminiArticlesArgs;
}

interface GeminiStructuredOutput {
  description: string;
  question_one: string;
  question_two: string;
  question_three: string;
}

const OUTPUT_SCHEMA = {
  type: Type.OBJECT,
  required: ['description', 'question_one', 'question_two', 'question_three'],
  properties: {
    description: {
      type: Type.STRING
    },
    question_one: {
      type: Type.STRING
    },
    question_two: {
      type: Type.STRING
    },
    question_three: {
      type: Type.STRING
    }
  }
};

export const handler = async (event: LambdaEvent): Promise<GeminiArticlesResponse> => {
  console.log('geminiArticles invoked');

  const { systemPrompt, userPrompt } = event.arguments;

  // Validate inputs
  if (!systemPrompt || !userPrompt) {
    return {
      success: false,
      error: 'Missing required fields: systemPrompt and userPrompt are required'
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return {
      success: false,
      error: 'Server configuration error'
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    console.log('Calling Gemini API');

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW
        },
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA
      }
    });

    if (!response.text) {
      console.error('Empty response from Gemini API');
      return {
        success: false,
        error: 'Empty response from Gemini API'
      };
    }

    // Parse the JSON response
    let parsed: GeminiStructuredOutput;
    try {
      parsed = JSON.parse(response.text);
    } catch (e) {
      console.error('Failed to parse Gemini response:', response.text);
      return {
        success: false,
        error: 'Failed to parse Gemini response'
      };
    }

    console.log('Gemini API call successful');

    return {
      success: true,
      description: parsed.description,
      question_one: parsed.question_one,
      question_two: parsed.question_two,
      question_three: parsed.question_three
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};
