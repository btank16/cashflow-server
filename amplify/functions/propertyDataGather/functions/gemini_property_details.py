"""Property details function using Gemini 3 Pro with grounded search."""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, validator
import logging
from ..common import (
    FunctionResult,
    ErrorCode,
    validate_input,
    create_error_response,
    create_success_response,
    measure_execution_time,
    GeminiClient,
    GeminiRequest,
    FunctionMetadata
)
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class InitialPropertyInfoInput(BaseModel):
    """Input for initial property info."""
    street: str
    city: str
    state: str
    zip: str
    county_name: str


class InitialPropertyInfoOutput(BaseModel):
    """Output for initial property info."""
    total_units: int
    total_sq_ft: int
    total_beds: int
    total_bath: int
    unit_sq_ft: List[int]
    unit_bed: List[int]
    unit_bath: List[int]

    @validator('unit_sq_ft', 'unit_bed', 'unit_bath')
    def validate_list_length(cls, v, values):
        if 'total_units' in values and len(v) != values['total_units']:
            raise ValueError(f"Array length {len(v)} does not match total_units {values['total_units']}")
        return v


def calculate_hybrid_sq_ft_distribution(
    total_sq_ft: int,
    unit_bed: List[int],
    total_units: int
) -> List[int]:
    """
    Calculate hybrid square footage distribution.

    Splits total square footage 50/50:
    - First half: distributed evenly among units
    - Second half: distributed proportionally by bedroom count

    Args:
        total_sq_ft: Total square footage
        unit_bed: List of bedroom counts per unit
        total_units: Total number of units

    Returns:
        List of square footage per unit
    """
    half_total = total_sq_ft / 2
    even_distribution = half_total / total_units

    total_beds = sum(unit_bed)
    proportional_distribution = [
        (half_total * beds / total_beds) if total_beds > 0 else 0
        for beds in unit_bed
    ]

    return [
        int(even_distribution + proportional_distribution[i])
        for i in range(total_units)
    ]


def _fill_missing_unit_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fill in missing unit-level data using available information.

    If unit_sq_ft is empty but we have total_sq_ft and unit_bed,
    calculate unit_sq_ft using the hybrid distribution formula.

    Args:
        data: Raw property data from API

    Returns:
        Data with missing fields filled in where possible
    """
    total_units = data.get('total_units', 0)
    total_sq_ft = data.get('total_sq_ft', 0)
    unit_bed = data.get('unit_bed', [])
    unit_sq_ft = data.get('unit_sq_ft', [])

    # If unit_sq_ft is empty/missing but we have the data to calculate it
    if (not unit_sq_ft or len(unit_sq_ft) != total_units) and total_sq_ft > 0 and len(unit_bed) == total_units:
        logger.info(f"Calculating unit_sq_ft using hybrid distribution (total_sq_ft={total_sq_ft}, units={total_units})")
        data['unit_sq_ft'] = calculate_hybrid_sq_ft_distribution(
            total_sq_ft,
            unit_bed,
            total_units
        )

    return data


def validate_property_data(data: Dict[str, Any]) -> bool:
    """
    Validate property data meets requirements.

    Args:
        data: Property data to validate

    Returns:
        True if valid, False otherwise
    """
    try:
        total_units = data.get('total_units', 0)
        if total_units <= 0:
            logger.error(f"Invalid total_units: {total_units}")
            return False

        # Check array lengths match total units
        if len(data.get('unit_bed', [])) != total_units:
            logger.error(f"unit_bed length {len(data.get('unit_bed', []))} != total_units {total_units}")
            return False
        if len(data.get('unit_bath', [])) != total_units:
            logger.error(f"unit_bath length {len(data.get('unit_bath', []))} != total_units {total_units}")
            return False
        if len(data.get('unit_sq_ft', [])) != total_units:
            logger.error(f"unit_sq_ft length {len(data.get('unit_sq_ft', []))} != total_units {total_units}")
            return False

        # Validate bedroom and bathroom sums
        sum_beds = sum(data['unit_bed'])
        sum_baths = sum(data['unit_bath'])

        if sum_beds != data.get('total_beds', 0):
            logger.warning(f"Sum of unit_bed {sum_beds} != total_beds {data.get('total_beds', 0)}, adjusting total_beds")
            data['total_beds'] = sum_beds
        if sum_baths != data.get('total_bath', 0):
            logger.warning(f"Sum of unit_bath {sum_baths} != total_bath {data.get('total_bath', 0)}, adjusting total_bath")
            data['total_bath'] = sum_baths

        # Validate square footage sum
        sum_sq_ft = sum(data['unit_sq_ft'])
        if abs(sum_sq_ft - data.get('total_sq_ft', 0)) > data.get('total_sq_ft', 0) * 0.15:
            logger.warning(
                f"Sum of unit_sq_ft {sum_sq_ft} differs from total_sq_ft {data.get('total_sq_ft', 0)} "
                f"by more than 15%, adjusting total_sq_ft"
            )
            data['total_sq_ft'] = sum_sq_ft

        return True
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return False


@measure_execution_time
def get_initial_property_info_gemini(
    input_data: Dict[str, Any],
    gemini_client: GeminiClient,
    max_retries: int = 2
) -> FunctionResult[InitialPropertyInfoOutput]:
    """
    Get initial property information using Gemini 3 Pro with grounded search.

    Args:
        input_data: Dictionary with street, city, state, zip, county_name
        gemini_client: Initialized Gemini client
        max_retries: Maximum number of retry attempts

    Returns:
        FunctionResult containing property details or error
    """
    # Validate input
    validation = validate_input(input_data, ['street', 'city', 'state', 'zip', 'county_name'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        property_input = InitialPropertyInfoInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Retry loop
    last_error: Optional[str] = None
    for attempt in range(max_retries):
        logger.info(f"Gemini property info attempt {attempt + 1} of {max_retries}")

        # Build user prompt - more explicit about array requirements
        user_prompt = (
            f"Find property information for the home at {property_input.street}, "
            f"{property_input.city}, {property_input.state} {property_input.zip}. "
            f"Search online real estate sites and the {property_input.county_name} county "
            f"property records website.\n\n"
            f"I need the following information:\n"
            f"- total_units: Number of units in the property\n"
            f"- total_sq_ft: Total square footage of the property\n"
            f"- total_beds: Total number of bedrooms across all units\n"
            f"- total_bath: Total number of bathrooms across all units\n"
            f"- unit_bed: Array of bedroom counts for EACH unit (must have exactly total_units elements)\n"
            f"- unit_bath: Array of bathroom counts for EACH unit (must have exactly total_units elements)\n"
            f"- unit_sq_ft: Array of square footage for EACH unit (must have exactly total_units elements)\n\n"
            f"IMPORTANT: The arrays unit_bed, unit_bath, and unit_sq_ft must each contain "
            f"exactly the same number of elements as total_units. For example, if total_units is 2, "
            f"then each array must have exactly 2 elements."
        )

        # Use Pydantic's model_json_schema() for proper schema generation
        json_schema = InitialPropertyInfoOutput.model_json_schema()

        request = GeminiRequest(
            model='gemini-3-pro-preview',
            system_prompt=STANDARD_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            json_schema=json_schema,
            thinking_level='low',
            enable_search_grounding=True
        )

        # Make API call
        result = gemini_client.chat_completion(request)

        if not result.success:
            last_error = result.error
            if attempt < max_retries - 1:
                logger.warning(f"Gemini API call failed, retrying... {result.error}")
                continue
            return result

        # Fill in missing unit data (e.g., calculate unit_sq_ft if missing)
        result.data = _fill_missing_unit_data(result.data)

        # Validate data
        if not validate_property_data(result.data):
            last_error = "Property data validation failed"
            if attempt < max_retries - 1:
                logger.warning("Data validation failed, retrying...")
                continue
            return create_error_response(
                "Property data validation failed after all retries",
                ErrorCode.DATA_VALIDATION_ERROR,
                metadata=result.metadata
            )

        # Parse output
        try:
            output = InitialPropertyInfoOutput(**result.data)
            result.data = output.model_dump()
            return result
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                logger.warning(f"Failed to parse property data: {e}, retrying...")
                continue
            return create_error_response(
                f"Failed to parse property data: {str(e)}",
                ErrorCode.DATA_VALIDATION_ERROR,
                metadata=result.metadata
            )

    # Should not reach here, but return error if we do
    return create_error_response(
        f"Failed to get valid property data after all retries: {last_error}",
        ErrorCode.INTERNAL_ERROR
    )
