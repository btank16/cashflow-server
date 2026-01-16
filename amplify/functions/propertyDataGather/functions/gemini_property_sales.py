"""Gemini-powered property sales lookup function."""

from typing import Dict, Any, List
from datetime import datetime
from dateutil.relativedelta import relativedelta
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
    timePeriod: int  # Number of months
    limit: int  # Max number of properties to find
    address: str  # Full address to focus search near


class PropertySalesOutput(BaseModel):
    """Output for property sales lookup."""
    addresses: List[str]
    saleDate: List[str]
    salePrice: List[str]
    beds: List[str]
    baths: List[str]
    sqFootage: List[str]


def format_time_period(months: int) -> str:
    """
    Convert number of months to a readable date range string.

    Examples (assuming current date is December 2025):
        6 -> "June through December of 2025"

    If January 2026 with 6 months:
        6 -> "July of 2025 through January of 2026"
    """
    now = datetime.now()
    start_date = now - relativedelta(months=months)

    start_month = start_date.strftime("%B")
    start_year = start_date.year
    end_month = now.strftime("%B")
    end_year = now.year

    if start_year == end_year:
        return f"{start_month} through {end_month} of {end_year}"
    else:
        return f"{start_month} of {start_year} through {end_month} of {end_year}"


@measure_execution_time
@retry_with_backoff(max_attempts=3)
def get_recent_property_sales(
    input_data: Dict[str, Any],
    gemini_client: GeminiClient
) -> FunctionResult[PropertySalesOutput]:
    """
    Get recently sold properties using Gemini with Google Search grounding.

    Args:
        input_data: Dictionary with:
            - propertyType: Type of property (e.g., "Single Family")
            - zipCode: 5-digit ZIP code
            - timePeriod: Number of months to search back
            - limit: Max number of properties to find
            - address: Full address to focus search near
        gemini_client: Initialized Gemini client

    Returns:
        FunctionResult containing list of addresses or error
    """
    # Validate input
    validation = validate_input(
        input_data,
        ['propertyType', 'zipCode', 'timePeriod', 'limit', 'address']
    )
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

    # Convert time period to readable date range
    time_period_str = format_time_period(sales_input.timePeriod)

    # Build user prompt
    user_prompt = (
        f"I am looking for {sales_input.propertyType} properties that have sold recently "
        f"in the zip code {sales_input.zipCode}. "
        f"Please find me up to {sales_input.limit} {sales_input.propertyType} properties "
        f"that have sold in {time_period_str} in this zip code. "
        f"Focus the majority of your compute finding properties near {sales_input.address}. "
        f"Please take your time to find a comprehensive list. "
        f"For each home that has sold I need you to find me the address, the sale date (in mm-dd-yyyy format), "
        f"the sale price, the bedrooms, the bathrooms, and the square footage."
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
