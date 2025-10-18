import Perplexity from '@perplexity-ai/perplexity_ai';

export interface PerplexityRequest {
  model: 'sonar' | 'sonar-pro';
  systemPrompt: string;
  userPrompt: string;
  searchDomainFilter?: string[];
  searchContextSize?: 'low' | 'medium' | 'high';
  jsonSchema?: any;
}

export interface PerplexityResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export class PerplexityClient {
  private client: Perplexity;

  constructor(apiKey: string) {
    this.client = new Perplexity({
      apiKey: apiKey,
    });
  }

  async chat(request: PerplexityRequest): Promise<PerplexityResponse> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: request.systemPrompt
        },
        {
          role: 'user' as const,
          content: request.userPrompt
        }
      ];

      // Build the request options
      const options: any = {
        model: request.model,
        messages: messages,
      };

      // Add search domain filter if provided (top-level field)
      if (request.searchDomainFilter) {
        options.search_domain_filter = request.searchDomainFilter;
      }

      // Add web search options if provided
      if (request.searchContextSize) {
        options.web_search_options = {
          search_context_size: request.searchContextSize
        };
      }

      // Add JSON mode if schema is provided
      if (request.jsonSchema) {
        options.response_format = request.jsonSchema;
      }

      // Make the API call
      const response = await this.client.chat.completions.create(options);

      // Extract the response content
      const messageContent = response.choices[0]?.message?.content;

      if (!messageContent) {
        return {
          success: false,
          error: 'No response content from Perplexity API'
        };
      }

      // Handle content that could be string or array of content chunks
      let content: string;
      if (typeof messageContent === 'string') {
        content = messageContent;
      } else if (Array.isArray(messageContent)) {
        // Extract text from content chunks
        content = messageContent
          .filter((chunk: any) => chunk.type === 'text')
          .map((chunk: any) => chunk.text)
          .join('');
      } else {
        return {
          success: false,
          error: 'Unexpected response content format from Perplexity API'
        };
      }

      // Parse JSON response if JSON mode was used
      if (request.jsonSchema) {
        try {
          const parsedData = JSON.parse(content);
          return {
            success: true,
            data: parsedData
          };
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError);
          return {
            success: false,
            error: 'Failed to parse JSON response',
            data: content // Return raw content as fallback
          };
        }
      }

      return {
        success: true,
        data: content
      };

    } catch (error) {
      console.error('Perplexity API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}