"""Base class for AI API clients with shared functionality."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import json
import re
import logging
from threading import Lock

from .types import FunctionResult, FunctionMetadata, ErrorCode
from .utils import create_error_response, create_success_response

logger = logging.getLogger(__name__)


class BaseAIClient(ABC):
    """
    Abstract base class for AI API clients.

    Provides shared functionality for:
    - JSON response parsing (with markdown stripping)
    - Error code detection from exceptions
    - Thread-safe API call counting
    - Standardized error responses

    Subclasses must implement:
    - _get_client_name(): Returns the client name for logging

    Example usage:
        class MyAIClient(BaseAIClient):
            def __init__(self, api_key: str):
                super().__init__(timeout=30.0)
                self._internal_client = SomeSDK(api_key)

            def _get_client_name(self) -> str:
                return "MyAI"

            def chat_completion(self, request):
                self._increment_api_calls()
                try:
                    response = self._internal_client.call(request)
                    return self._parse_json_response(response.text, request.model)
                except Exception as e:
                    return self._create_error_result(e, request.model)
    """

    def __init__(self, timeout: float = 30.0):
        """
        Initialize the base AI client.

        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self._api_calls = 0
        self._api_calls_lock = Lock()

    @property
    def api_calls(self) -> int:
        """Get total API calls made (thread-safe)."""
        with self._api_calls_lock:
            return self._api_calls

    def _increment_api_calls(self) -> int:
        """Increment and return the API call counter (thread-safe)."""
        with self._api_calls_lock:
            self._api_calls += 1
            return self._api_calls

    def reset_api_calls(self) -> None:
        """Reset the API call counter (thread-safe)."""
        with self._api_calls_lock:
            self._api_calls = 0

    @abstractmethod
    def _get_client_name(self) -> str:
        """
        Get the name of the client for logging purposes.

        Returns:
            Client name string (e.g., 'Perplexity', 'Gemini')
        """
        pass

    def _strip_markdown_code_blocks(self, content: str) -> str:
        """
        Remove markdown code block wrappers from content.

        Handles:
        - ```json ... ```
        - ``` ... ```

        Args:
            content: Raw content that may have markdown wrappers

        Returns:
            Clean content without markdown wrappers
        """
        if not content:
            return content

        content = content.strip()

        # Pattern: ```json\n{...}\n```
        if content.startswith('```json'):
            match = re.match(r'^```json\s*([\s\S]*?)\s*```$', content)
            if match:
                return match.group(1).strip()

        # Pattern: ```\n{...}\n```
        if content.startswith('```'):
            match = re.match(r'^```\s*([\s\S]*?)\s*```$', content)
            if match:
                return match.group(1).strip()

        return content

    def _parse_json_response(
        self,
        content: str,
        model: str,
        extra_metadata: Optional[Dict[str, Any]] = None
    ) -> FunctionResult[Dict[str, Any]]:
        """
        Parse JSON from response content.

        Args:
            content: Response content (may have markdown wrappers)
            model: Model name for metadata
            extra_metadata: Optional extra metadata to include

        Returns:
            FunctionResult with parsed JSON or error
        """
        try:
            clean_content = self._strip_markdown_code_blocks(content)
            data = json.loads(clean_content)

            metadata = FunctionMetadata(
                api_calls=1,
                model=model,
                extra=extra_metadata
            )

            return create_success_response(data=data, metadata=metadata)

        except json.JSONDecodeError as e:
            logger.error(f"{self._get_client_name()} JSON parsing error: {e}")
            logger.debug(f"Raw content (truncated): {content[:500]}...")

            return create_error_response(
                f"Failed to parse JSON response: {str(e)}",
                ErrorCode.DATA_VALIDATION_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    model=model,
                    extra={
                        'raw_content': content[:1000] if content else None,
                        'json_parse_error': str(e),
                        **(extra_metadata or {})
                    }
                )
            )

    def _detect_error_code(self, error: Exception) -> ErrorCode:
        """
        Detect appropriate error code from exception.

        Args:
            error: The exception that occurred

        Returns:
            Appropriate ErrorCode enum value
        """
        error_str = str(error).lower()

        if any(term in error_str for term in ['rate limit', '429', 'quota', 'too many']):
            return ErrorCode.RATE_LIMIT_ERROR
        elif any(term in error_str for term in ['timeout', 'timed out']):
            return ErrorCode.TIMEOUT_ERROR
        elif any(term in error_str for term in ['unauthorized', '401', 'invalid key', 'invalid api']):
            return ErrorCode.CONFIG_ERROR
        elif any(term in error_str for term in ['not found', '404']):
            return ErrorCode.NOT_FOUND
        elif any(term in error_str for term in ['bad request', '400', 'invalid']):
            return ErrorCode.VALIDATION_ERROR
        elif any(term in error_str for term in ['server error', '500', '502', '503']):
            return ErrorCode.EXTERNAL_API_ERROR
        else:
            return ErrorCode.API_ERROR

    def _create_error_result(
        self,
        error: Exception,
        model: str,
        extra_metadata: Optional[Dict[str, Any]] = None
    ) -> FunctionResult:
        """
        Create standardized error result from exception.

        Args:
            error: The exception that occurred
            model: Model name for metadata
            extra_metadata: Optional extra metadata to include

        Returns:
            FunctionResult with error details
        """
        error_code = self._detect_error_code(error)
        client_name = self._get_client_name()

        logger.error(f"{client_name} API error: {error}")

        return create_error_response(
            f"{client_name} API error: {str(error)}",
            error_code,
            metadata=FunctionMetadata(
                api_calls=1,
                model=model,
                extra=extra_metadata
            )
        )

    def _create_no_data_result(
        self,
        model: str,
        message: Optional[str] = None
    ) -> FunctionResult:
        """
        Create standardized no-data result.

        Args:
            model: Model name for metadata
            message: Optional custom message

        Returns:
            FunctionResult indicating no data
        """
        client_name = self._get_client_name()
        error_message = message or f"No response content from {client_name}"

        return create_error_response(
            error_message,
            ErrorCode.NO_DATA,
            metadata=FunctionMetadata(api_calls=1, model=model)
        )

    def _create_success_result(
        self,
        data: Any,
        model: str,
        search_domains: Optional[list] = None,
        extra_metadata: Optional[Dict[str, Any]] = None
    ) -> FunctionResult:
        """
        Create standardized success result.

        Args:
            data: Response data
            model: Model name for metadata
            search_domains: Optional list of search domains
            extra_metadata: Optional extra metadata

        Returns:
            FunctionResult with success data
        """
        metadata = FunctionMetadata(
            api_calls=1,
            model=model,
            search_domains=search_domains,
            extra=extra_metadata
        )

        return create_success_response(data=data, metadata=metadata)
