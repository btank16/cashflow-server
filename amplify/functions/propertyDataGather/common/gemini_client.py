"""Gemini 3 Pro API client wrapper with structured outputs and Google Search grounding."""

from typing import Optional, Dict, Any
from google import genai
from google.genai import types
from pydantic import BaseModel
import logging

from .base_ai_client import BaseAIClient
from .types import FunctionResult

logger = logging.getLogger(__name__)


class GeminiRequest(BaseModel):
    """
    Request configuration for Gemini API.

    When json_schema is provided, the API will use structured output mode
    to return JSON that conforms to the schema.

    When enable_search_grounding is True, the model will use Google Search
    to ground responses with real-time web data.

    Example:
        request = GeminiRequest(
            model='gemini-3-pro-preview',
            system_prompt='You are a real estate analyst',
            user_prompt='What is the current median home price in Austin TX?',
            json_schema={
                'type': 'object',
                'properties': {'median_price': {'type': 'number'}},
                'required': ['median_price']
            },
            enable_search_grounding=True
        )
    """
    model: str = 'gemini-3-pro-preview'
    system_prompt: str = ''
    user_prompt: str
    json_schema: Optional[Dict[str, Any]] = None
    thinking_level: str = 'low'  # 'low' or 'high'
    enable_search_grounding: bool = False
    temperature: float = 1.0  # Keep at default per Gemini docs


class GeminiClient(BaseAIClient):
    """Wrapper for Gemini AI API client with structured outputs and search grounding."""

    def __init__(self, api_key: str, timeout: float = 30.0):
        """
        Initialize Gemini client.

        Args:
            api_key: Gemini API key
            timeout: Request timeout in seconds
        """
        super().__init__(timeout=timeout)
        self.client = genai.Client(api_key=api_key)

    def _get_client_name(self) -> str:
        """Get the client name for logging."""
        return "Gemini"

    def _extract_grounding_info(self, candidate: Any) -> Optional[Dict[str, Any]]:
        """
        Extract grounding metadata from response candidate.

        Args:
            candidate: Response candidate from Gemini

        Returns:
            Grounding info dict or None
        """
        if not hasattr(candidate, 'grounding_metadata') or not candidate.grounding_metadata:
            return None

        gm = candidate.grounding_metadata
        grounding_info = {
            'search_queries': getattr(gm, 'web_search_queries', None),
        }

        # Extract grounding chunks if available
        grounding_chunks = getattr(gm, 'grounding_chunks', None)
        if grounding_chunks:
            grounding_info['grounding_chunks'] = [
                {'uri': chunk.web.uri, 'title': chunk.web.title}
                for chunk in grounding_chunks
                if hasattr(chunk, 'web') and chunk.web
            ]

        return grounding_info

    def chat_completion(self, request: GeminiRequest) -> FunctionResult:
        """
        Make a chat completion request to Gemini with optional structured output and grounding.

        Args:
            request: Gemini request configuration

        Returns:
            FunctionResult containing response data or error
        """
        try:
            self._increment_api_calls()

            # Build contents with user prompt
            contents = request.user_prompt

            # Build generation config
            config_params = {
                'temperature': request.temperature,
            }

            # Add thinking configuration
            config_params['thinking_config'] = types.ThinkingConfig(
                thinking_budget=0 if request.thinking_level == 'low' else -1
            )

            # Add system instruction if provided
            if request.system_prompt:
                config_params['system_instruction'] = request.system_prompt

            # Configure structured output if json_schema provided
            if request.json_schema:
                config_params['response_mime_type'] = 'application/json'
                config_params['response_schema'] = request.json_schema

            # Configure Google Search grounding if enabled
            tools = []
            if request.enable_search_grounding:
                tools.append(types.Tool(google_search=types.GoogleSearch()))

            if tools:
                config_params['tools'] = tools

            # Create the config object
            config = types.GenerateContentConfig(**config_params)

            # Make the API call
            response = self.client.models.generate_content(
                model=request.model,
                contents=contents,
                config=config
            )

            # Extract content from response
            if response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                content = candidate.content.parts[0].text if candidate.content.parts else None

                if not content:
                    return self._create_no_data_result(request.model)

                # Extract grounding metadata if available
                grounding_info = self._extract_grounding_info(candidate)

                # Build extra metadata
                extra_metadata = {
                    'thinking_level': request.thinking_level,
                    'search_grounding_enabled': request.enable_search_grounding,
                }
                if grounding_info:
                    extra_metadata['grounding_info'] = grounding_info

                # Parse JSON if schema provided (uses base class method)
                if request.json_schema:
                    return self._parse_json_response(
                        content,
                        request.model,
                        extra_metadata=extra_metadata
                    )
                else:
                    # Return raw content for non-JSON requests
                    return self._create_success_result(
                        data=content,
                        model=request.model,
                        extra_metadata=extra_metadata
                    )
            else:
                return self._create_no_data_result(
                    request.model,
                    message="No response candidates from Gemini"
                )

        except Exception as e:
            return self._create_error_result(e, request.model)
