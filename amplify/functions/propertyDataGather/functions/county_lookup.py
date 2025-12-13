"""County lookup function."""

from pydantic import BaseModel

from ..common import create_perplexity_function


class CountyNameInput(BaseModel):
    """Input for county lookup."""
    city_name: str
    state_name: str


class CountyNameOutput(BaseModel):
    """Output for county lookup."""
    county_name: str


def _build_county_prompt(input_obj: CountyNameInput) -> str:
    """Build the prompt for county lookup."""
    return (
        f"What county is {input_obj.city_name} {input_obj.state_name} in? "
        f"Just provide me with the county name"
    )


# Create the function using the factory
# Note: No search domains needed for this general knowledge query
get_county_name: callable = create_perplexity_function(
    input_model=CountyNameInput,
    output_model=CountyNameOutput,
    prompt_builder=_build_county_prompt,
    domains=[],  # No specific domain filter
    model='sonar',
    function_name='get_county_name'
)
