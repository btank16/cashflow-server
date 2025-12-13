"""Similar areas lookup function."""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging
from ..common import (
    FunctionResult,
    ErrorCode,
    FunctionMetadata,
    create_error_response,
    retry_with_backoff,
    measure_execution_time,
    PerplexityClient,
    PerplexityRequest
)
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class SimilarAreasInput(BaseModel):
    """Input for similar areas lookup."""
    # For neighborhood mode
    city: Optional[str] = None
    state: Optional[str] = None
    neighborhood: Optional[str] = None
    # For city mode
    county_name: Optional[str] = None
    city_name: Optional[str] = None
    state_name: Optional[str] = None


class SimilarAreasOutput(BaseModel):
    """Output for similar areas lookup."""
    similar_areas: List[str]


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_similar_areas(
    input_data: Dict[str, Any],
    perplexity_client: PerplexityClient
) -> FunctionResult[SimilarAreasOutput]:
    """
    Get similar neighborhoods or cities based on socioeconomic status and demographics.

    Args:
        input_data: Dictionary with either (city, state, neighborhood) or (county_name, city_name, state_name)
        perplexity_client: Initialized Perplexity client

    Returns:
        FunctionResult containing list of similar areas or error
    """
    # Parse input
    try:
        similar_input = SimilarAreasInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Determine which mode we're in based on neighborhood presence
    isNeighborhoodMode = bool(similar_input.neighborhood)

    # Validate input based on mode
    if isNeighborhoodMode:
        # Neighborhood comparison mode
        if not similar_input.city or not similar_input.state or not similar_input.neighborhood:
            return create_error_response(
                "City, state, and neighborhood are required for neighborhood comparison",
                ErrorCode.VALIDATION_ERROR
            )
    else:
        # City comparison mode - use alternative field names if provided
        countyName = similar_input.county_name
        cityName = similar_input.city_name or similar_input.city
        stateName = similar_input.state_name or similar_input.state

        if not countyName or not cityName or not stateName:
            return create_error_response(
                "County name, city name, and state name are required for city comparison",
                ErrorCode.VALIDATION_ERROR
            )

    # Build the prompt based on mode
    if isNeighborhoodMode:
        # Neighborhood comparison prompt
        user_prompt = f"I need you to review the socioeconomic and demographic data of {similar_input.city} {similar_input.state}. Please also review each individual neighborhood of {similar_input.city} {similar_input.state} as well. Please tell me the two neighborhoods that are similar in socioeconomic status and demographics as the {similar_input.neighborhood} neighborhood."
    else:
        # City comparison prompt
        countyName = similar_input.county_name
        cityName = similar_input.city_name or similar_input.city
        stateName = similar_input.state_name or similar_input.state

        user_prompt = f"I need you to review the socioeconomic and demographic data of {countyName} {stateName}. Please also review each individual city of {countyName} as well. Please tell me the two cities that are similar in socioeconomic status and demographics as {cityName}."

    # Build Perplexity request
    # Use Pydantic's model_json_schema() for proper schema generation
    json_schema = SimilarAreasOutput.model_json_schema()

    request = PerplexityRequest(
        model='sonar',
        system_prompt=STANDARD_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        json_schema=json_schema
    )

    # Make API call
    result = perplexity_client.chat_completion(request)

    if not result.success:
        return result

    # Validate the response data - the API returns similar_neighborhoods field
    if not result.data or 'similar_neighborhoods' not in result.data:
        error_message = (
            'Unable to find similar neighborhoods for comparison'
            if isNeighborhoodMode
            else 'Unable to find similar areas for comparison'
        )
        return create_error_response(
            error_message,
            ErrorCode.NO_DATA,
            metadata=result.metadata
        )

    # Map the API response to our output format
    searchMode = 'neighborhood' if isNeighborhoodMode else 'city'

    # Add search mode to metadata
    if result.metadata:
        result.metadata.search_scope = searchMode
    else:
        result.metadata = FunctionMetadata(search_scope=searchMode)

    # Validate and parse output - map similar_neighborhoods to similar_areas
    try:
        output = SimilarAreasOutput(similar_areas=result.data['similar_neighborhoods'])
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse similar areas data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
