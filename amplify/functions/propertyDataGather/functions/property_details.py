"""Property details function."""

from typing import Dict, Any, List
from pydantic import BaseModel, validator
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


def validate_property_data(data: Dict[str, Any]) -> bool:
    """
    Validate property data meets requirements.

    Args:
        data: Property data to validate

    Returns:
        True if valid, False otherwise
    """
    try:
        # Check array lengths match total units
        if len(data['unit_bed']) != data['total_units']:
            logger.error(f"unit_bed length {len(data['unit_bed'])} != total_units {data['total_units']}")
            return False
        if len(data['unit_bath']) != data['total_units']:
            logger.error(f"unit_bath length {len(data['unit_bath'])} != total_units {data['total_units']}")
            return False
        if len(data['unit_sq_ft']) != data['total_units']:
            logger.error(f"unit_sq_ft length {len(data['unit_sq_ft'])} != total_units {data['total_units']}")
            return False

        # Validate bedroom and bathroom sums
        sum_beds = sum(data['unit_bed'])
        sum_baths = sum(data['unit_bath'])

        if sum_beds != data['total_beds']:
            logger.error(f"Sum of unit_bed {sum_beds} != total_beds {data['total_beds']}")
            return False
        if sum_baths != data['total_bath']:
            logger.error(f"Sum of unit_bath {sum_baths} != total_bath {data['total_bath']}")
            return False

        # Validate square footage using hybrid distribution
        calculated_sq_ft = calculate_hybrid_sq_ft_distribution(
            data['total_sq_ft'],
            data['unit_bed'],
            data['total_units']
        )

        # Check if calculated matches provided
        for i, (calc, provided) in enumerate(zip(calculated_sq_ft, data['unit_sq_ft'])):
            # Allow 10% tolerance
            tolerance = calc * 0.1
            if abs(calc - provided) > tolerance:
                logger.warning(
                    f"Unit {i}: calculated sq ft {calc} differs from provided {provided} "
                    f"by more than 10%"
                )

        return True
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return False


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


@measure_execution_time
def get_initial_property_info(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient,
    max_retries: int = 2
) -> FunctionResult[InitialPropertyInfoOutput]:
    """
    Get initial property information including units, square footage, beds, and baths.

    Args:
        input_data: Dictionary with street, city, state, zip, county_name
        perplexity_client: Initialized Perplexity client
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
    for attempt in range(max_retries):
        logger.info(f"Attempt {attempt + 1} of {max_retries}")

        # Build Perplexity request
        user_prompt = f"I need you to find property information on the home at {property_input.street}, {property_input.city}, {property_input.state} {property_input.zip}. Please search online real estate sites and the {property_input.county_name} county website where public information is posted on properties. I need you to find the following information and present it in json format: number of units, total square footage, total beds, total baths, square footage of each unit, bedrooms in each unit, and bathrooms in each unit."

        json_schema = {
            "type": "object",
            "properties": {
                "total_units": {"type": "integer"},
                "total_sq_ft": {"type": "integer"},
                "total_beds": {"type": "integer"},
                "total_bath": {"type": "integer"},
                "unit_sq_ft": {"type": "array", "items": {"type": "integer"}},
                "unit_bed": {"type": "array", "items": {"type": "integer"}},
                "unit_bath": {"type": "array", "items": {"type": "integer"}}
            },
            "required": [
                "total_units", "total_sq_ft", "total_beds", "total_bath",
                "unit_sq_ft", "unit_bed", "unit_bath"
            ]
        }

        request = PerplexityRequest(
            model='sonar',
            system_prompt=STANDARD_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            json_schema=json_schema
        )

        # Make API call
        result = perplexity_client.chat_completion(request)

        if not result.success:
            if attempt < max_retries - 1:
                logger.warning(f"API call failed, retrying... {result.error}")
                continue
            return result

        # Validate data
        if not validate_property_data(result.data):
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
        "Failed to get valid property data after all retries",
        ErrorCode.INTERNAL_ERROR
    )
