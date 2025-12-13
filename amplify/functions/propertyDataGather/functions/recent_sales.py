"""Recent sale info lookup function."""

from pydantic import BaseModel

from ..common import create_perplexity_function


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


def _build_recent_sale_prompt(input_obj: RecentSaleInfoInput) -> str:
    """Build the prompt for recent sale info lookup."""
    return (
        f"I need you to look into price and sale history for the property at: "
        f"{input_obj.street}, {input_obj.city}, {input_obj.state} {input_obj.zip}. "
        f"Please provide me with the date the property sold (mm-dd-yyyy) and the sale price. "
        f"If the property is currently for sale, reply with \"for sale\" as the sale date."
    )


# Create the function using the factory
get_recent_sale_info: callable = create_perplexity_function(
    input_model=RecentSaleInfoInput,
    output_model=RecentSaleInfoOutput,
    prompt_builder=_build_recent_sale_prompt,
    domains=['realtor.com', 'redfin.com'],
    model='sonar',
    function_name='get_recent_sale_info'
)
