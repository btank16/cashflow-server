"""Property tax lookup function."""

from pydantic import BaseModel

from ..common import create_perplexity_function


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


def _build_property_tax_prompt(input_obj: PropertyTaxRealtorInput) -> str:
    """Build the prompt for property tax lookup."""
    return (
        f"I need you to look into the property history at a home in {input_obj.city} "
        f"{input_obj.state}. Please find the {input_obj.year} taxes for the property at "
        f"the following address: {input_obj.street}, {input_obj.city}, {input_obj.state} "
        f"{input_obj.zip}"
    )


# Create the function using the factory
get_property_tax: callable = create_perplexity_function(
    input_model=PropertyTaxRealtorInput,
    output_model=PropertyTaxRealtorOutput,
    prompt_builder=_build_property_tax_prompt,
    domains=['realtor.com'],
    model='sonar',
    function_name='get_property_tax'
)
