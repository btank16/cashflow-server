"""Factory for creating Perplexity-based functions with minimal boilerplate."""

from typing import Dict, Any, List, Optional, Type, Callable, TypeVar
from pydantic import BaseModel, ValidationError
import logging

from .types import FunctionResult, ErrorCode, FunctionMetadata
from .utils import create_error_response, retry_with_backoff, measure_execution_time
from .perplexity_client import PerplexityClient, PerplexityRequest
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

T_Input = TypeVar('T_Input', bound=BaseModel)
T_Output = TypeVar('T_Output', bound=BaseModel)


def create_perplexity_function(
    input_model: Type[T_Input],
    output_model: Type[T_Output],
    prompt_builder: Callable[[T_Input], str],
    domains: List[str],
    model: str = 'sonar',
    required_fields: Optional[List[str]] = None,
    max_retries: int = 3,
    function_name: str = 'perplexity_function'
) -> Callable[[Dict[str, Any], PerplexityClient], FunctionResult[T_Output]]:
    """
    Factory function that creates Perplexity-based lookup functions.

    This eliminates the boilerplate code that is duplicated across all Perplexity
    functions (validation, input parsing, request building, output parsing).

    Args:
        input_model: Pydantic model class for validating input
        output_model: Pydantic model class for validating output
        prompt_builder: Function that takes parsed input and returns the user prompt string
        domains: List of search domain filters for Perplexity
        model: Perplexity model to use ('sonar' or 'sonar-pro')
        required_fields: List of required field names for validation. If None, uses input_model fields.
        max_retries: Maximum retry attempts for exponential backoff
        function_name: Name for logging purposes

    Returns:
        A function that takes (input_data: Dict, perplexity_client: PerplexityClient)
        and returns FunctionResult[T_Output]

    Example:
        >>> # Define models
        >>> class CountyInput(BaseModel):
        ...     city_name: str
        ...     state_name: str
        >>>
        >>> class CountyOutput(BaseModel):
        ...     county_name: str
        >>>
        >>> # Create function
        >>> get_county = create_perplexity_function(
        ...     input_model=CountyInput,
        ...     output_model=CountyOutput,
        ...     prompt_builder=lambda i: f"What county is {i.city_name}, {i.state_name} in?",
        ...     domains=['google.com'],
        ...     function_name='get_county'
        ... )
        >>>
        >>> # Use it
        >>> result = get_county({'city_name': 'Cleveland', 'state_name': 'Ohio'}, client)
    """

    # Determine required fields from input model if not provided
    if required_fields is None:
        required_fields = list(input_model.model_fields.keys())

    @measure_execution_time
    @retry_with_backoff(max_attempts=max_retries)
    def perplexity_function(
        input_data: Dict[str, Any],
        perplexity_client: PerplexityClient
    ) -> FunctionResult[T_Output]:
        """Generated Perplexity function."""

        # Validate required fields
        missing = [f for f in required_fields if f not in input_data or input_data[f] is None]
        if missing:
            return create_error_response(
                f"Missing required fields: {missing}",
                ErrorCode.VALIDATION_ERROR
            )

        # Parse input with Pydantic model
        try:
            parsed_input = input_model(**input_data)
        except ValidationError as e:
            return create_error_response(
                f"Invalid input format: {str(e)}",
                ErrorCode.VALIDATION_ERROR
            )
        except Exception as e:
            return create_error_response(
                f"Failed to parse input: {str(e)}",
                ErrorCode.VALIDATION_ERROR
            )

        # Build user prompt
        try:
            user_prompt = prompt_builder(parsed_input)
        except Exception as e:
            logger.error(f"{function_name}: Error building prompt: {e}")
            return create_error_response(
                f"Error building prompt: {str(e)}",
                ErrorCode.INTERNAL_ERROR
            )

        # Build Perplexity request
        json_schema = output_model.model_json_schema()

        request = PerplexityRequest(
            model=model,
            system_prompt=STANDARD_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            search_domain_filter=domains if domains else None,
            json_schema=json_schema
        )

        # Make API call
        result = perplexity_client.chat_completion(request)

        if not result.success:
            return result

        # Validate and parse output with Pydantic model
        try:
            output = output_model(**result.data)
            result.data = output.model_dump()
            return result
        except ValidationError as e:
            return create_error_response(
                f"Failed to parse {function_name} output: {str(e)}",
                ErrorCode.DATA_VALIDATION_ERROR,
                metadata=result.metadata
            )
        except Exception as e:
            return create_error_response(
                f"Failed to process {function_name} output: {str(e)}",
                ErrorCode.DATA_VALIDATION_ERROR,
                metadata=result.metadata
            )

    # Set function name for better debugging
    perplexity_function.__name__ = function_name
    perplexity_function.__doc__ = f"Perplexity function: {function_name}"

    return perplexity_function


# =============================================================================
# Pre-built prompt builders for common patterns
# =============================================================================

def build_address_prompt(template: str) -> Callable:
    """
    Create a prompt builder for address-based queries.

    Args:
        template: Template string with placeholders for {street}, {city}, {state}, {zip}

    Example:
        >>> builder = build_address_prompt(
        ...     "Find the property tax for {street}, {city}, {state} {zip}"
        ... )
    """
    def builder(input_obj):
        return template.format(
            street=getattr(input_obj, 'street', ''),
            city=getattr(input_obj, 'city', ''),
            state=getattr(input_obj, 'state', ''),
            zip=getattr(input_obj, 'zip', '')
        )
    return builder


def build_location_prompt(template: str) -> Callable:
    """
    Create a prompt builder for location-based queries (city/state).

    Args:
        template: Template string with placeholders for {city}, {state}
    """
    def builder(input_obj):
        return template.format(
            city=getattr(input_obj, 'city', ''),
            state=getattr(input_obj, 'state', '')
        )
    return builder
