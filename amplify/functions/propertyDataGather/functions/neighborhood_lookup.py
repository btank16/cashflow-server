"""Neighborhood lookup function."""

from pydantic import BaseModel

from ..common import create_perplexity_function


class NeighborhoodNameInput(BaseModel):
    """Input for neighborhood lookup."""
    street: str
    city: str
    state: str
    zip: str


class NeighborhoodNameOutput(BaseModel):
    """Output for neighborhood lookup."""
    neighborhood: str


def _build_neighborhood_prompt(input_obj: NeighborhoodNameInput) -> str:
    """Build the prompt for neighborhood lookup."""
    return (
        f"I need you to tell me what neighborhood of {input_obj.city} {input_obj.state} "
        f"the following address is in: {input_obj.street}, {input_obj.city}, "
        f"{input_obj.state} {input_obj.zip}. Please provide only the neighborhood name "
        f"in your response"
    )


# Create the function using the factory
get_neighborhood_name: callable = create_perplexity_function(
    input_model=NeighborhoodNameInput,
    output_model=NeighborhoodNameOutput,
    prompt_builder=_build_neighborhood_prompt,
    domains=['zillow.com'],
    model='sonar',
    function_name='get_neighborhood_name'
)
