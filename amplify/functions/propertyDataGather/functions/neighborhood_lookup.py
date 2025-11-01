"""Neighborhood lookup function."""

from typing import Dict, Any
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


class NeighborhoodNameInput(BaseModel):
    """Input for neighborhood lookup."""
    street: str
    city: str
    state: str
    zip: str


class NeighborhoodNameOutput(BaseModel):
    """Output for neighborhood lookup."""
    neighborhood: str


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_neighborhood_name(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[NeighborhoodNameOutput]:
    """
    Get the neighborhood name for a given address.

    Args:
        input_data: Dictionary with street, city, state, zip
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing neighborhood name or error
    """
    # Validate input
    validation = validate_input(input_data, ['street', 'city', 'state', 'zip'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        neighborhood_input = NeighborhoodNameInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build Perplexity request
    user_prompt = f"I need you to tell me what neighborhood of {neighborhood_input.city} {neighborhood_input.state} the following address is in: {neighborhood_input.street}, {neighborhood_input.city}, {neighborhood_input.state} {neighborhood_input.zip}. Please provide only the neighborhood name in your response"

    json_schema = {
        "type": "object",
        "properties": {
            "neighborhood": {"type": "string"}
        },
        "required": ["neighborhood"]
    }

    request = PerplexityRequest(
        model='sonar',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        search_domain_filter=['zillow.com'],
        json_schema=json_schema
    )

    # Make API call
    result = perplexity_client.chat_completion(request)

    if not result.success:
        return result

    # Validate and parse output
    try:
        output = NeighborhoodNameOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse neighborhood data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
