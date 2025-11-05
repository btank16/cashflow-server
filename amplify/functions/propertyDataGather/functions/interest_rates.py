"""Interest rate lookup function."""

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


class InterestRateFinalInput(BaseModel):
    """Input for interest rate lookup."""
    state_name: str
    down_payment: float
    loan_type: str


class InterestRateFinalOutput(BaseModel):
    """Output for interest rate lookup."""
    interest_rate: float


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_interest_rate(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[InterestRateFinalOutput]:
    """
    Get current mortgage interest rate.

    Args:
        input_data: Dictionary with state_name, down_payment, loan_type
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing interest rate or error
    """
    # Validate input
    validation = validate_input(input_data, ['state_name', 'down_payment', 'loan_type'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        rate_input = InterestRateFinalInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build Perplexity request
    user_prompt = f"I need you to find me mortgage rates for a {rate_input.loan_type} mortgage in {rate_input.state_name}. Note that I am putting {rate_input.down_payment}% down as a down payment"

    # Use Pydantic's model_json_schema() for proper schema generation
    json_schema = InterestRateFinalOutput.model_json_schema()

    request = PerplexityRequest(
        model='sonar',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        search_domain_filter=['freddiemac.com', 'nerdwallet.com', 'bankrate.com'],
        json_schema=json_schema
    )

    # Make API call
    result = perplexity_client.chat_completion(request)

    if not result.success:
        return result

    # Validate and parse output
    try:
        output = InterestRateFinalOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse interest rate data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
