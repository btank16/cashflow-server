"""Utility functions for propertyDataGather."""

from typing import Any, Dict, List, Optional, Callable, TypeVar
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)
import time
import logging
from .types import FunctionResult, FunctionMetadata, ErrorCode

logger = logging.getLogger(__name__)

T = TypeVar('T')


def validate_input(input_data: Dict[str, Any], required_fields: List[str]) -> Dict[str, Any]:
    """
    Validate that all required fields are present and non-empty.

    Args:
        input_data: Dictionary to validate
        required_fields: List of required field names

    Returns:
        Dictionary with 'is_valid' boolean and 'missing_fields' list
    """
    missing_fields = []
    for field in required_fields:
        if field not in input_data or not input_data[field]:
            missing_fields.append(field)

    return {
        'is_valid': len(missing_fields) == 0,
        'missing_fields': missing_fields
    }


def create_error_response(
    message: str,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    metadata: Optional[FunctionMetadata] = None
) -> FunctionResult:
    """
    Create a standardized error response.

    Args:
        message: Error message
        code: Error code
        metadata: Optional metadata

    Returns:
        FunctionResult with error details
    """
    return FunctionResult(
        success=False,
        error=message,
        error_code=code,
        metadata=metadata
    )


def create_success_response(
    data: Any,
    metadata: Optional[FunctionMetadata] = None
) -> FunctionResult:
    """
    Create a standardized success response.

    Args:
        data: Response data
        metadata: Optional metadata

    Returns:
        FunctionResult with success data
    """
    return FunctionResult(
        success=True,
        data=data,
        metadata=metadata
    )


def retry_with_backoff(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    max_delay: float = 10.0,
    exponential_base: float = 2.0
):
    """
    Decorator for retry with exponential backoff.

    Args:
        max_attempts: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        exponential_base: Base for exponential backoff

    Returns:
        Retry decorator
    """
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(
            multiplier=initial_delay,
            max=max_delay,
            exp_base=exponential_base
        ),
        retry=retry_if_exception_type(Exception)
    )


def measure_execution_time(func: Callable) -> Callable:
    """
    Decorator to measure function execution time.

    Args:
        func: Function to wrap

    Returns:
        Wrapped function that tracks execution time
    """
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        execution_time = time.time() - start_time

        if isinstance(result, FunctionResult):
            if result.metadata is None:
                result.metadata = FunctionMetadata()
            result.metadata.execution_time = execution_time

        return result
    return wrapper


def combine_metadata(results: List[FunctionResult]) -> FunctionMetadata:
    """
    Combine metadata from multiple function results.

    Args:
        results: List of function results

    Returns:
        Combined metadata
    """
    total_api_calls = 0
    total_execution_time = 0.0
    models = []
    search_domains = []

    for result in results:
        if result.metadata:
            total_api_calls += result.metadata.api_calls
            total_execution_time += result.metadata.execution_time
            if result.metadata.model and result.metadata.model not in models:
                models.append(result.metadata.model)
            if result.metadata.search_domains:
                for domain in result.metadata.search_domains:
                    if domain not in search_domains:
                        search_domains.append(domain)

    return FunctionMetadata(
        api_calls=total_api_calls,
        execution_time=total_execution_time,
        model=', '.join(models) if models else None,
        search_domains=search_domains if search_domains else None
    )


def is_success(result: FunctionResult) -> bool:
    """Check if a function result is successful."""
    return result.success


def extract_data(result: FunctionResult) -> Any:
    """
    Extract data from a function result.

    Args:
        result: Function result

    Returns:
        Data if successful

    Raises:
        ValueError: If result is not successful
    """
    if not result.success:
        raise ValueError(f"Cannot extract data from failed result: {result.error}")
    return result.data
