"""Property tax lookup function."""

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


class PropertyTaxRealtorInput(BaseModel):
    """Input for property tax lookup."""
    street: str
    city: str
    state: str
    zip: str
    year: int


class PropertyTaxRealtorOutput(BaseModel):
    """Output for property tax lookup."""
    annual_taxes: float


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_property_tax(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[PropertyTaxRealtorOutput]:
    """
    Get property tax information from Realtor.com.

    Args:
        input_data: Dictionary with street, city, state, zip, year
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing annual taxes or error
    """
    # Validate input
    validation = validate_input(input_data, ['street', 'city', 'state', 'zip', 'year'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        tax_input = PropertyTaxRealtorInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build Perplexity request
    user_prompt = f"I need you to look into the property history at a home in {tax_input.city} {tax_input.state}. Please find the {tax_input.year} taxes for the property at the following address: {tax_input.street}, {tax_input.city}, {tax_input.state} {tax_input.zip}"

    json_schema = {
        "type": "object",
        "properties": {
            "annual_taxes": {"type": "number"}
        },
        "required": ["annual_taxes"]
    }

    request = PerplexityRequest(
        model='sonar',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        search_domain_filter=['realtor.com'],
        json_schema=json_schema
    )

    # Make API call
    result = perplexity_client.chat_completion(request)

    if not result.success:
        return result

    # Validate and parse output
    try:
        output = PropertyTaxRealtorOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse property tax data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
