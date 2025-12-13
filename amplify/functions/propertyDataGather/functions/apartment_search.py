"""Apartment search function."""

from typing import List, Optional, Union
from pydantic import BaseModel

from ..common import create_perplexity_function


def deduplicate_addresses(address_lists: List[List[str]]) -> List[str]:
    """
    Deduplicate addresses from multiple lists while preserving order.

    This utility function is useful when aggregating results from multiple
    apartment searches or property queries and ensuring no duplicate addresses.

    Args:
        address_lists: List of address lists to deduplicate

    Returns:
        Deduplicated list of unique addresses (preserves original formatting)

    Example:
        >>> lists = [
        ...     ["123 Main St", "456 Oak Ave"],
        ...     ["123 main st", "789 Pine Dr"]
        ... ]
        >>> deduplicate_addresses(lists)
        ["123 Main St", "456 Oak Ave", "789 Pine Dr"]
    """
    seen = set()
    unique_addresses = []

    for address_list in address_lists:
        for address in address_list:
            # Normalize address for comparison (lowercase, strip whitespace)
            normalized = address.lower().strip()
            if normalized not in seen:
                seen.add(normalized)
                unique_addresses.append(address)  # Keep original formatting

    return unique_addresses


class ApartmentCompInput(BaseModel):
    """Input for apartment search."""
    city: str
    state: str
    bed_count: Union[int, str]
    bath_count: Union[int, str]
    neighborhood: Optional[str] = None


class ApartmentCompOutput(BaseModel):
    """Output for apartment search."""
    addresses: List[str]


def _build_apartment_comp_prompt(input_obj: ApartmentCompInput) -> str:
    """Build the prompt for apartment comp search."""
    # Build location string based on whether neighborhood is provided
    location = (
        f"{input_obj.neighborhood}, {input_obj.city}, {input_obj.state}"
        if input_obj.neighborhood
        else f"{input_obj.city}, {input_obj.state}"
    )

    return (
        f"I need you to look for places to rent in {location}. "
        f"Please look for units with {input_obj.bed_count} bedroom and {input_obj.bath_count} bathroom. "
        f"I am looking for units at residential addresses (not apartment buildings). "
        f"Please list all the addresses you can find in an array."
    )


# Create the function using the factory
# Uses sonar-pro for better search results
get_apartment_comps: callable = create_perplexity_function(
    input_model=ApartmentCompInput,
    output_model=ApartmentCompOutput,
    prompt_builder=_build_apartment_comp_prompt,
    domains=['redfin.com', 'apartments.com', 'zillow.com'],
    model='sonar-pro',
    required_fields=['city', 'state', 'bed_count', 'bath_count'],
    function_name='get_apartment_comps'
)
