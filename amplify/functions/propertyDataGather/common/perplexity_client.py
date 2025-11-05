"""Perplexity AI API client wrapper."""

from typing import Optional, List, Dict, Any
from perplexity import Perplexity
from pydantic import BaseModel
import json
import logging
from .types import FunctionResult, FunctionMetadata, ErrorCode
from .utils import create_error_response, create_success_response

logger = logging.getLogger(__name__)


class PerplexityRequest(BaseModel):
    """
    Request configuration for Perplexity API.
    
    When json_schema is provided, the API will use response_format with 
    json_schema mode to return structured JSON output that conforms to the schema.
    
    Example:
        request = PerplexityRequest(
            model='sonar-pro',
            system_prompt='You are a helpful assistant',
            user_prompt='Extract financial data',
            json_schema={
                'type': 'object',
                'properties': {'revenue': {'type': 'number'}},
                'required': ['revenue']
            }
        )
    """
    model: str = 'sonar'
    system_prompt: str = ''
    user_prompt: str
    search_domain_filter: Optional[List[str]] = None
    json_schema: Optional[Dict[str, Any]] = None


class PerplexityClient:
    """Wrapper for Perplexity AI API client."""

    def __init__(self, api_key: str, max_retries: int = 2, timeout: float = 30.0):
        """
        Initialize Perplexity client.

        Args:
            api_key: Perplexity API key
            max_retries: Maximum number of retries
            timeout: Request timeout in seconds
        """
        self.client = Perplexity(api_key=api_key, max_retries=max_retries, timeout=timeout)
        self.api_calls = 0

    def chat_completion(self, request: PerplexityRequest) -> FunctionResult:
        """
        Make a chat completion request to Perplexity.

        Args:
            request: Perplexity request configuration

        Returns:
            FunctionResult containing response data or error
        """
        try:
            self.api_calls += 1

            # Build messages
            messages = []
            if request.system_prompt:
                messages.append({
                    "role": "system",
                    "content": request.system_prompt
                })
            messages.append({
                "role": "user",
                "content": request.user_prompt
            })

            # Build web search options if needed
            web_search_options = {}
            if request.search_domain_filter:
                web_search_options['search_domain_filter'] = request.search_domain_filter

            # Build kwargs for API call
            kwargs = {
                'messages': messages,
                'model': request.model
            }

            if web_search_options:
                kwargs['web_search_options'] = web_search_options

            # Add response_format if json_schema is provided
            # This uses Perplexity's native JSON mode for structured output
            if request.json_schema:
                kwargs['response_format'] = {
                    'type': 'json_schema',
                    'json_schema': {
                        'schema': request.json_schema
                    }
                }

            # Make the API call
            response = self.client.chat.completions.create(**kwargs)

            # Extract content from response
            if hasattr(response, 'choices') and response.choices:
                content = response.choices[0].message.content

                # Parse JSON if schema provided
                # When using response_format with json_schema, Perplexity returns clean JSON
                if request.json_schema:
                    try:
                        # With native JSON mode, content should be clean JSON
                        # But we'll still handle potential markdown wrapping as fallback
                        json_str = content.strip()
                        
                        # Remove markdown code blocks if present (shouldn't be needed with json_schema mode)
                        if json_str.startswith('```json'):
                            json_start = json_str.find('```json') + 7
                            json_end = json_str.find('```', json_start)
                            if json_end != -1:
                                json_str = json_str[json_start:json_end].strip()
                        elif json_str.startswith('```'):
                            json_start = json_str.find('```') + 3
                            json_end = json_str.find('```', json_start)
                            if json_end != -1:
                                json_str = json_str[json_start:json_end].strip()

                        data = json.loads(json_str)
                        return create_success_response(
                            data=data,
                            metadata=FunctionMetadata(
                                api_calls=1,
                                model=request.model,
                                search_domains=request.search_domain_filter
                            )
                        )
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON parsing error: {e}")
                        logger.error(f"Raw content: {content}")
                        # Return error instead of fallback to encourage proper error handling
                        return create_error_response(
                            f"Failed to parse JSON response: {str(e)}",
                            ErrorCode.DATA_VALIDATION_ERROR,
                            metadata=FunctionMetadata(
                                api_calls=1,
                                model=request.model,
                                extra={'raw_content': content, 'json_parse_error': str(e)}
                            )
                        )
                else:
                    # Return raw content for non-JSON requests
                    return create_success_response(
                        data=content,
                        metadata=FunctionMetadata(
                            api_calls=1,
                            model=request.model,
                            search_domains=request.search_domain_filter
                        )
                    )
            else:
                return create_error_response(
                    "No response content from Perplexity",
                    ErrorCode.NO_DATA,
                    metadata=FunctionMetadata(api_calls=1)
                )

        except Exception as e:
            logger.error(f"Perplexity API error: {e}")
            error_code = ErrorCode.API_ERROR

            # Check for specific error types
            error_str = str(e).lower()
            if 'rate limit' in error_str or '429' in error_str:
                error_code = ErrorCode.RATE_LIMIT_ERROR
            elif 'timeout' in error_str:
                error_code = ErrorCode.TIMEOUT_ERROR

            return create_error_response(
                f"Perplexity API error: {str(e)}",
                error_code,
                metadata=FunctionMetadata(api_calls=1)
            )
