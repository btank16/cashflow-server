"""County lookup function."""

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
    PerplexityRequest,
    FunctionMetadata
)
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class CountyNameInput(BaseModel):
    """Input for county lookup."""
    city_name: str
    state_name: str


class CountyNameOutput(BaseModel):
    """Output for county lookup."""
    county_name: str


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_county_name(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[CountyNameOutput]:
    """
    Get the county name for a given city and state.

    Args:
        input_data: Dictionary with city_name and state_name
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing county name or error
    """
    # Validate input
    validation = validate_input(input_data, ['city_name', 'state_name'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        county_input = CountyNameInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build Perplexity request
    user_prompt = f"What county is {county_input.city_name} {county_input.state_name} in? Just provide me with the county name"

    json_schema = {
        "type": "object",
        "properties": {
            "county_name": {"type": "string"}
        },
        "required": ["county_name"]
    }

    request = PerplexityRequest(
        model='sonar',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        json_schema=json_schema
    )

    # Make API call
    result = perplexity_client.chat_completion(request)

    if not result.success:
        return result

    # Validate and parse output
    try:
        output = CountyNameOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse county data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
