"""Interest rate lookup and adjustment functions."""

from typing import Dict, Any
from pydantic import BaseModel

from ..common import create_perplexity_function
from ..common.types import FunctionResult, ErrorCode
from ..common.utils import create_success_response, validate_input, create_error_response


class InterestRateFinalInput(BaseModel):
    """Input for interest rate lookup."""
    state_name: str
    down_payment: float
    loan_type: str


class InterestRateFinalOutput(BaseModel):
    """Output for interest rate lookup."""
    interest_rate: float


class AdjustedInterestRateInput(BaseModel):
    """Input for interest rate adjustment."""
    interest_rate: float
    property_type: str
    is_primary_residence: bool


class AdjustedInterestRateOutput(BaseModel):
    """Output for adjusted interest rate."""
    adjusted_rate: float
    base_rate: float
    adjustment: float
    adjustment_reason: str


def _build_interest_rate_prompt(input_obj: InterestRateFinalInput) -> str:
    """Build the prompt for interest rate lookup."""
    return (
        f"I need you to find me mortgage rates for a {input_obj.loan_type} mortgage "
        f"in {input_obj.state_name}. Note that I am putting {input_obj.down_payment}% "
        f"down as a down payment"
    )


# Create the function using the factory
get_interest_rate: callable = create_perplexity_function(
    input_model=InterestRateFinalInput,
    output_model=InterestRateFinalOutput,
    prompt_builder=_build_interest_rate_prompt,
    domains=['freddiemac.com', 'nerdwallet.com', 'bankrate.com'],
    model='sonar',
    function_name='get_interest_rate'
)


def adjust_interest_rate(
    input_data: Dict[str, Any]
) -> FunctionResult[AdjustedInterestRateOutput]:
    """
    Adjust interest rate based on property type and residence status.

    Adjustment rules:
    1. If not primary residence: add 1.0% to interest rate
    2. If primary residence but Multi-Family: add 0.25% to interest rate

    Args:
        input_data: Dictionary containing:
            - interest_rate: Base interest rate (float)
            - property_type: Type of property (e.g., "Single Family", "Multi-Family")
            - is_primary_residence: Whether this is the buyer's primary residence (bool)

    Returns:
        FunctionResult containing adjusted rate, base rate, adjustment amount, and reason

    Example:
        >>> result = adjust_interest_rate({
        ...     'interest_rate': 6.5,
        ...     'property_type': 'Multi-Family',
        ...     'is_primary_residence': True
        ... })
        >>> if result.success:
        ...     print(result.data['adjusted_rate'])  # 6.75
    """
    # Validate input
    validation = validate_input(input_data, ['interest_rate', 'property_type', 'is_primary_residence'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    try:
        adj_input = AdjustedInterestRateInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    base_rate = adj_input.interest_rate
    adjustment = 0.0
    reason = "No adjustment needed"

    # Rule 1: Not primary residence -> add 1.0%
    if not adj_input.is_primary_residence:
        adjustment = 1.0
        reason = "Investment property (non-primary residence)"
    # Rule 2: Primary residence but Multi-Family -> add 0.25%
    elif adj_input.property_type == "Multi-Family":
        adjustment = 0.25
        reason = "Primary residence multi-family property"

    adjusted_rate = round(base_rate + adjustment, 3)

    output = AdjustedInterestRateOutput(
        adjusted_rate=adjusted_rate,
        base_rate=base_rate,
        adjustment=adjustment,
        adjustment_reason=reason
    )

    return create_success_response(output.model_dump())
