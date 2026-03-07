"""Gemini-powered apartment comps lookup function."""

from typing import Dict, Any, List, Union
from pydantic import BaseModel
import logging
from ..common import (
    FunctionResult,
    ErrorCode,
    validate_input,
    create_error_response,
    retry_with_backoff,
    measure_execution_time,
    GeminiClient,
    GeminiRequest,
    FunctionMetadata
)
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class ApartmentCompsInput(BaseModel):
    """Input for apartment comps lookup."""
    zipCode: str
    bedrooms: int
    bathrooms: Union[int, float]
    address: str  # Full address to focus search near
    limit: int = 50


class ApartmentCompsOutput(BaseModel):
    """Output for apartment comps lookup."""
    addresses: List[str]
    rent: List[str]
    beds: List[str]
    baths: List[str]
    sqFootage: List[str]


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_gemini_apartment_comps(
    input_data: Dict[str, Any],
    gemini_client: GeminiClient
) -> FunctionResult[ApartmentCompsOutput]:
    """
    Get apartment rental comps using Gemini with Google Search grounding.

    Args:
        input_data: Dictionary with:
            - zipCode: 5-digit ZIP code
            - bedrooms: Number of bedrooms to match
            - bathrooms: Number of bathrooms to match
            - address: Full address to focus search near
            - limit: Max number of properties to find (default 50)
        gemini_client: Initialized Gemini client

    Returns:
        FunctionResult containing list of rental comps or error
    """
    # Validate input
    validation = validate_input(
        input_data,
        ['zipCode', 'bedrooms', 'bathrooms', 'address']
    )
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        comps_input = ApartmentCompsInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build user prompt
    user_prompt = (
        f"I am looking for rental properties in the zip code {comps_input.zipCode}. "
        f"Please find me up to {comps_input.limit} rental listings with {comps_input.bedrooms} bedrooms "
        f"and {comps_input.bathrooms} bathrooms. "
        f"Focus the majority of your compute finding properties near {comps_input.address}. "
        f"Please take your time to find a comprehensive list. "
        f"For each rental I need the address, the monthly rent, the bedrooms, the bathrooms, and the square footage."
    )

    # Use Pydantic's model_json_schema() for proper schema generation
    json_schema = ApartmentCompsOutput.model_json_schema()

    request = GeminiRequest(
        model='gemini-pro-latest',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        json_schema=json_schema,
        thinking_level='low',
        enable_search_grounding=True
    )

    # Make API call
    result = gemini_client.chat_completion(request)

    if not result.success:
        return result

    # Validate and parse output
    try:
        output = ApartmentCompsOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse apartment comps data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
