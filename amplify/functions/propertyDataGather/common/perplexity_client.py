"""Perplexity AI API client wrapper."""

from typing import Optional, List, Dict, Any
from perplexity import Perplexity
from pydantic import BaseModel
import logging

from .base_ai_client import BaseAIClient
from .types import FunctionResult

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


class PerplexityClient(BaseAIClient):
    """Wrapper for Perplexity AI API client."""

    def __init__(self, api_key: str, max_retries: int = 2, timeout: float = 30.0):
        """
        Initialize Perplexity client.

        Args:
            api_key: Perplexity API key
            max_retries: Maximum number of retries
            timeout: Request timeout in seconds
        """
        super().__init__(timeout=timeout)
        self.client = Perplexity(api_key=api_key, max_retries=max_retries, timeout=timeout)

    def _get_client_name(self) -> str:
        """Get the client name for logging."""
        return "Perplexity"

    def chat_completion(self, request: PerplexityRequest) -> FunctionResult:
        """
        Make a chat completion request to Perplexity.

        Args:
            request: Perplexity request configuration

        Returns:
            FunctionResult containing response data or error
        """
        try:
            self._increment_api_calls()

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

                # Parse JSON if schema provided (uses base class method)
                if request.json_schema:
                    return self._parse_json_response(
                        content,
                        request.model,
                        extra_metadata={'search_domains': request.search_domain_filter}
                    )
                else:
                    # Return raw content for non-JSON requests
                    return self._create_success_result(
                        data=content,
                        model=request.model,
                        search_domains=request.search_domain_filter
                    )
            else:
                return self._create_no_data_result(request.model)

        except Exception as e:
            return self._create_error_result(e, request.model)
