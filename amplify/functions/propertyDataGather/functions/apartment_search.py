"""Apartment search function."""

from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel
import logging
from ..common import (
    FunctionResult,
    ErrorCode,
    validate_input,
    create_error_response,
    retry_with_backoff,
    measure_execution_time,
    PerplexityClient,
    PerplexityRequest
)
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class ApartmentCompInput(BaseModel):
    """Input for apartment search."""
    city: str
    state: str
    bed_count: Union[int, str]
    bath_count: Union[int, str]
    neighborhood: Optional[str] = None


class ApartmentCompOutput(BaseModel):
    """Output for apartment search."""
    addresses: List[str]


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_apartment_comps(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[ApartmentCompOutput]:
    """
    Search for rental apartment units with specific bedroom/bathroom configurations.

    Args:
        input_data: Dictionary with city, state, bed_count, bath_count, neighborhood (optional)
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing list of apartment addresses or error
    """
    # Validate input
    validation = validate_input(input_data, ['city', 'state', 'bed_count', 'bath_count'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        apt_input = ApartmentCompInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build location string based on whether neighborhood is provided
    location = (
        f"{apt_input.neighborhood}, {apt_input.city}, {apt_input.state}"
        if apt_input.neighborhood
        else f"{apt_input.city}, {apt_input.state}"
    )

    # Build Perplexity request
    user_prompt = f"I need you to look for places to rent in {location}. Please look for units with {apt_input.bed_count} bedroom and {apt_input.bath_count} bathroom. I am looking for units at residential addresses (not apartment buildings). Please list all the addresses you can find in an array."

    json_schema = {
        "type": "object",
        "properties": {
            "addresses": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["addresses"]
    }

    request = PerplexityRequest(
        model='sonar-pro',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        search_domain_filter=['redfin.com', 'apartments.com', 'zillow.com'],
        json_schema=json_schema
    )

    # Make API call
    result = perplexity_client.chat_completion(request)

    if not result.success:
        return result

    # Validate and parse output
    try:
        output = ApartmentCompOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse apartment search data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
