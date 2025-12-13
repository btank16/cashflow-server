"""Comparable sales lookup function."""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging
from ..common import (
    FunctionResult,
    ErrorCode,
    FunctionMetadata,
    validate_input,
    create_error_response,
    retry_with_backoff,
    measure_execution_time,
    PerplexityClient,
    PerplexityRequest
)
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class ComparableSalesInput(BaseModel):
    """Input for comparable sales lookup."""
    street: str
    city: str
    state: str
    zip: str
    property_type: str
    neighborhood: Optional[str] = None


class ComparableSalesOutput(BaseModel):
    """Output for comparable sales lookup."""
    addresses: List[str]


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_comparable_sales(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[ComparableSalesOutput]:
    """
    Get comparable sales for a property.

    Args:
        input_data: Dictionary with street, city, state, zip, property_type, neighborhood (optional)
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing list of comparable addresses or error
    """
    # Validate input
    validation = validate_input(input_data, ['street', 'city', 'state', 'zip', 'property_type'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        comp_input = ComparableSalesInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build the search scope - neighborhood-specific or city-wide
    searchScope = (
        f"{comp_input.neighborhood}, {comp_input.city}, {comp_input.state}"
        if comp_input.neighborhood
        else f"{comp_input.city}, {comp_input.state}"
    )

    # Build Perplexity request
    user_prompt = f"I am looking to purchase a {comp_input.property_type} home at {comp_input.street}, {comp_input.city}, {comp_input.state} {comp_input.zip}. I need you to find a comparable {comp_input.property_type} properties that have sold recently in {searchScope}. Please note the difference between properties for sale and properties that have sold. Provide the address of all the properties that you can find in an array."

    # Use Pydantic's model_json_schema() for proper schema generation
    json_schema = ComparableSalesOutput.model_json_schema()

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

    # Add search scope to metadata
    search_scope = 'neighborhood' if comp_input.neighborhood else 'city'
    if result.metadata:
        result.metadata.search_scope = search_scope
    else:
        result.metadata = FunctionMetadata(search_scope=search_scope)

    # Validate and parse output
    try:
        output = ComparableSalesOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse comparable sales data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
