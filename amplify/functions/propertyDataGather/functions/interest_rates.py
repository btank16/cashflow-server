"""Interest rate lookup function."""

from pydantic import BaseModel

from ..common import create_perplexity_function


class InterestRateFinalInput(BaseModel):
    """Input for interest rate lookup."""
    state_name: str
    down_payment: float
    loan_type: str


class InterestRateFinalOutput(BaseModel):
    """Output for interest rate lookup."""
    interest_rate: float


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
