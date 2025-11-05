"""Recent sale info lookup function."""

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


class RecentSaleInfoInput(BaseModel):
    """Input for recent sale info lookup."""
    street: str
    city: str
    state: str
    zip: str


class RecentSaleInfoOutput(BaseModel):
    """Output for recent sale info lookup."""
    sale_date: str
    sale_price: float


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_recent_sale_info(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[RecentSaleInfoOutput]:
    """
    Get recent sale information for a property.

    Args:
        input_data: Dictionary with street, city, state, zip
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing sale date and price or error
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
        sale_input = RecentSaleInfoInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build Perplexity request
    user_prompt = f"I need you to look into price and sale history for the property at: {sale_input.street}, {sale_input.city}, {sale_input.state} {sale_input.zip}. Please provide me with the date the property sold (mm-dd-yyyy) and the sale price. If the property is currently for sale, reply with \"for sale\" as the sale date."

    # Use Pydantic's model_json_schema() for proper schema generation
    json_schema = RecentSaleInfoOutput.model_json_schema()

    request = PerplexityRequest(
        model='sonar',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        search_domain_filter=['realtor.com', 'redfin.com'],
        json_schema=json_schema
    )

    # Make API call
    result = perplexity_client.chat_completion(request)

    if not result.success:
        return result

    # Validate and parse output
    try:
        output = RecentSaleInfoOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse recent sale data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
