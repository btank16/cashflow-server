"""Gemini-powered property sales lookup function."""

from typing import Dict, Any, List
from pydantic import BaseModel
import logging
from ..common import (
    FunctionResult,
    ErrorCode,
    validate_input,
    create_error_response,
    retry_with_backoff,
    measure_execution_time,
    GeminiClient,
    GeminiRequest,
    FunctionMetadata
)
from ..config import STANDARD_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class PropertySalesInput(BaseModel):
    """Input for property sales lookup."""
    propertyType: str
    zipCode: str
    timePeriod: str


class PropertySalesOutput(BaseModel):
    """Output for property sales lookup."""
    addresses: List[str]
    saleDate: List[str]
    salePrice: List[str]
    sqFootage: List[str]


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_recent_property_sales(
    input_data: Dict[str, Any],
    gemini_client: GeminiClient
) -> FunctionResult[PropertySalesOutput]:
    """
    Get recently sold properties using Gemini with Google Search grounding.

    Args:
        input_data: Dictionary with propertyType, zipCode, and timePeriod
        gemini_client: Initialized Gemini client

    Returns:
        FunctionResult containing list of addresses or error
    """
    # Validate input
    validation = validate_input(input_data, ['propertyType', 'zipCode', 'timePeriod'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        sales_input = PropertySalesInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    # Build user prompt
    user_prompt = (
        f"I am looking for {sales_input.propertyType} properties that have sold recently "
        f"in the zip code {sales_input.zipCode}. Please find me all the {sales_input.propertyType} "
        f"properties that have sold in the last {sales_input.timePeriod} in this zip code. Please take your time to find a comprehensive list. For each home that has sold I need you to find me the address, the sale date, the sale price, and the square footage."
    )

    # Use Pydantic's model_json_schema() for proper schema generation
    json_schema = PropertySalesOutput.model_json_schema()

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
        return result

    # Validate and parse output
    try:
        output = PropertySalesOutput(**result.data)
        result.data = output.model_dump()
        return result
    except Exception as e:
        return create_error_response(
            f"Failed to parse property sales data: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR,
            metadata=result.metadata
        )
