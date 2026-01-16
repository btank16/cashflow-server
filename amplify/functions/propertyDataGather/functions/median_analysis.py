"""Five-number summary statistical analysis function."""

from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel
import statistics
import logging
from ..common import (
    FunctionResult,
    ErrorCode,
    FunctionMetadata,
    validate_input,
    create_error_response,
    create_success_response,
    measure_execution_time
)

logger = logging.getLogger(__name__)


class FiveNumberSummaryInput(BaseModel):
    """Input for five-number summary calculation."""
    values: List[Union[int, float]]
    field_name: Optional[str] = None
    is_sorted: bool = False


class FiveNumberSummaryOutput(BaseModel):
    """Full five-number summary output (3+ data points)."""
    min: float
    q1: float
    median: float
    q3: float
    max: float
    count: int
    result_type: str = "full"
    field_name: Optional[str] = None


class RangeOutput(BaseModel):
    """Range-only output (2 data points)."""
    min: float
    max: float
    count: int
    result_type: str = "range"
    field_name: Optional[str] = None


class SingleValueOutput(BaseModel):
    """Single value output (1 data point)."""
    value: float
    count: int
    result_type: str = "single"
    field_name: Optional[str] = None


class OutlierFilterResult(BaseModel):
    """Result of IQR-based outlier filtering."""
    filtered_indices: List[int]  # Indices of entries to keep
    outlier_indices: List[int]  # Indices of entries identified as outliers
    lower_bound: Optional[float] = None  # Q1 - (iqr_multiplier * IQR)
    upper_bound: Optional[float] = None  # Q3 + (iqr_multiplier * IQR)
    was_applied: bool  # False if count < min_count (insufficient data)
    original_count: int
    filtered_count: int
    outlier_count: int


@measure_execution_time
def get_five_number_summary(
    input_data: Dict[str, Any]
) -> FunctionResult[Union[FiveNumberSummaryOutput, RangeOutput, SingleValueOutput]]:
    """
    Calculate a five-number summary from a dataset.

    Handles edge cases for small datasets:
    - 0 values: Returns error with NO_DATA
    - 1 value: Returns SingleValueOutput with INSUFFICIENT_DATA error code
    - 2 values: Returns RangeOutput (min, max only)
    - 3+ values: Returns full FiveNumberSummaryOutput (min, Q1, median, Q3, max)

    Args:
        input_data: Dictionary with:
            - values: List of numeric values (int or float)
            - field_name: Optional label for the data (e.g., "sale_price")
            - is_sorted: Whether values are already sorted (default: False)

    Returns:
        FunctionResult containing the appropriate output type based on data size
    """
    # Validate input
    validation = validate_input(input_data, ['values'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    # Parse input
    try:
        summary_input = FiveNumberSummaryInput(**input_data)
    except Exception as e:
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )

    values = summary_input.values
    field_name = summary_input.field_name
    count = len(values)

    # Build base metadata
    metadata = FunctionMetadata(
        source="median_analysis",
        result_count=count,
        extra={"field_name": field_name} if field_name else None
    )

    # Handle empty dataset
    if count == 0:
        return create_error_response(
            "No data points provided",
            ErrorCode.NO_DATA,
            metadata=metadata
        )

    # Convert to floats for consistent output
    float_values = [float(v) for v in values]

    # Sort if not already sorted
    if not summary_input.is_sorted:
        float_values = sorted(float_values)

    # Handle single data point
    if count == 1:
        output = SingleValueOutput(
            value=float_values[0],
            count=count,
            field_name=field_name
        )
        return FunctionResult(
            success=True,
            data=output.model_dump(),
            error_code=ErrorCode.INSUFFICIENT_DATA,
            metadata=metadata
        )

    # Handle two data points (range only)
    if count == 2:
        output = RangeOutput(
            min=float_values[0],
            max=float_values[1],
            count=count,
            field_name=field_name
        )
        return create_success_response(
            output.model_dump(),
            metadata=metadata
        )

    # Handle 3+ data points (full five-number summary)
    try:
        min_val = float_values[0]
        max_val = float_values[-1]
        median_val = statistics.median(float_values)

        # Use inclusive method for quartiles (works with 3+ data points)
        quartiles = statistics.quantiles(float_values, n=4, method='inclusive')
        q1 = quartiles[0]
        q3 = quartiles[2]

        output = FiveNumberSummaryOutput(
            min=min_val,
            q1=q1,
            median=median_val,
            q3=q3,
            max=max_val,
            count=count,
            field_name=field_name
        )
        return create_success_response(
            output.model_dump(),
            metadata=metadata
        )

    except Exception as e:
        logger.error(f"Error calculating five-number summary: {str(e)}")
        return create_error_response(
            f"Error calculating statistics: {str(e)}",
            ErrorCode.INTERNAL_ERROR,
            metadata=metadata
        )


def filter_iqr_outliers(
    values: List[Optional[float]],
    min_count: int = 5,
    iqr_multiplier: float = 1.5
) -> OutlierFilterResult:
    """
    Identify outliers using the IQR method and return indices to keep/remove.

    The IQR method defines outliers as values that fall outside:
    - Lower bound: Q1 - (iqr_multiplier * IQR)
    - Upper bound: Q3 + (iqr_multiplier * IQR)

    Args:
        values: List of numeric values (None values are ignored but preserve index)
        min_count: Minimum number of valid data points required to apply outlier detection.
                   If fewer valid points exist, all entries are kept.
        iqr_multiplier: Multiplier for IQR to determine bounds (default 1.5 is standard)

    Returns:
        OutlierFilterResult with indices of entries to keep and remove
    """
    # Build list of (original_index, value) for valid values
    indexed_values = [
        (i, v) for i, v in enumerate(values)
        if v is not None
    ]

    original_count = len(values)
    valid_count = len(indexed_values)

    # If insufficient data for outlier detection, keep all entries
    if valid_count < min_count:
        return OutlierFilterResult(
            filtered_indices=list(range(original_count)),
            outlier_indices=[],
            lower_bound=None,
            upper_bound=None,
            was_applied=False,
            original_count=original_count,
            filtered_count=original_count,
            outlier_count=0
        )

    # Extract just the values and sort for quartile calculation
    valid_values = [v for _, v in indexed_values]
    sorted_values = sorted(valid_values)

    # Calculate Q1, Q3, and IQR
    quartiles = statistics.quantiles(sorted_values, n=4, method='inclusive')
    q1 = quartiles[0]
    q3 = quartiles[2]
    iqr = q3 - q1

    # Calculate bounds
    lower_bound = q1 - (iqr_multiplier * iqr)
    upper_bound = q3 + (iqr_multiplier * iqr)

    # Identify outliers and non-outliers
    filtered_indices = []
    outlier_indices = []

    for i, v in enumerate(values):
        if v is None:
            # Keep entries with None values (they weren't part of calculation)
            filtered_indices.append(i)
        elif lower_bound <= v <= upper_bound:
            filtered_indices.append(i)
        else:
            outlier_indices.append(i)

    return OutlierFilterResult(
        filtered_indices=filtered_indices,
        outlier_indices=outlier_indices,
        lower_bound=lower_bound,
        upper_bound=upper_bound,
        was_applied=True,
        original_count=original_count,
        filtered_count=len(filtered_indices),
        outlier_count=len(outlier_indices)
    )
