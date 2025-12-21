"""
Type definitions for the New Rental Workflow Lambda function.
Orchestrates property data gathering with ThreadPoolExecutor parallelism.
"""

import time
import threading
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel
from enum import Enum

# Import from propertyDataGather for consistency
from propertyDataGather.common.types import ErrorCode, FunctionMetadata


class WorkflowStepStatus(str, Enum):
    """Status of a workflow step."""
    PENDING = 'pending'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    SKIPPED = 'skipped'


class WorkflowStep(str, Enum):
    """Enumeration of all workflow steps."""
    VALIDATION = 'validation'
    INTEREST_RATE = 'interest_rate'
    BOUNDARY_ANALYSIS = 'boundary_analysis'
    PROPERTY_INFO = 'property_info'
    PROPERTY_TAX = 'property_tax'
    SALES_DATA = 'sales_data'
    FORMATTED_OUTPUT = 'formatted_output'


# =============================================================================
# Input Models
# =============================================================================

class NewRentalWorkflowInput(BaseModel):
    """Input for the new rental workflow - address information."""
    street: str
    city: str
    state: str
    zip: str


class WorkflowConfig(BaseModel):
    """Configuration options for the workflow."""
    default_down_payment: float = 20.0
    default_loan_type: str = "30-year fixed"
    sales_time_period: int = 6  # Number of months
    sales_limit: int = 50  # Max number of sales to find
    sqft_tolerance_percent: float = 0.10  # +/-10%
    search_radius_miles: float = 2.0
    is_primary_residence: bool = False
    # Polygon expansion settings
    enable_polygon_expansion: bool = True
    min_data_for_analysis: int = 5  # Minimum data points before tier 1-2 expansion
    max_expansion_tiers: int = 2  # Maximum tier 1-2 expansion iterations
    min_data_for_tier_three: int = 2  # If ≤ this after tier 2, trigger tier 3 (crosses primary roads)
    # Distance fallback settings (when polygon unavailable)
    fallback_comp_count: int = 5  # Number of closest comps to return when polygon unavailable


# =============================================================================
# Step Result Models - Extends FunctionMetadata from propertyDataGather
# =============================================================================

class WorkflowStepMetadata(FunctionMetadata):
    """Extended metadata for workflow steps."""
    retry_attempted: bool = False


class WorkflowStepResult(BaseModel):
    """Result of a single workflow step."""
    step_name: str
    success: bool
    status: WorkflowStepStatus = WorkflowStepStatus.PENDING
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[ErrorCode] = None
    metadata: Optional[WorkflowStepMetadata] = None


class WorkflowError(BaseModel):
    """Error information from a workflow step."""
    step: str
    error: str
    code: Optional[ErrorCode] = None


# =============================================================================
# Data Structure Models
# =============================================================================

class GeocodingData(BaseModel):
    """Geocoding result data."""
    lat: float
    lon: float
    type: str  # e.g., "house"
    osm_type: str
    osm_id: int
    display_name: str
    address: Dict[str, Any]
    boundingbox: List[str]


class BoundingBoxData(BaseModel):
    """Bounding box analysis results."""
    radius_bbox: List[float]  # [min_lat, max_lat, min_lon, max_lon]
    radius_miles: float


class PolygonExpansionMetadata(BaseModel):
    """Metadata about polygon expansion through soft boundaries."""
    original_area_sq_degrees: float
    expanded_area_sq_degrees: float
    expansion_tiers_used: int
    included_polygon_count: int
    included_polygon_indices: List[int] = []
    expansion_reason: Optional[str] = None  # e.g., "insufficient_sales_data"
    tier_three_triggered: bool = False  # True if tier 3 expansion (crossing primary roads) was used


class PolygonData(BaseModel):
    """Boundary polygon metadata (polygon geometry stored separately as Shapely object)."""
    osm_ways_count: int = 0
    polygon_area_sq_degrees: Optional[float] = None
    construction_method: Optional[str] = None
    selected_polygon_idx: Optional[int] = None
    total_polygons_found: Optional[int] = None
    # Expansion fields
    is_expanded: bool = False
    expansion_metadata: Optional[PolygonExpansionMetadata] = None


class InterestRateData(BaseModel):
    """Interest rate result."""
    interest_rate: float
    state: str
    loan_type: str
    down_payment: float


class PropertyTaxData(BaseModel):
    """Property tax data."""
    annual_taxes: float
    tax_year: Optional[int] = None
    source: str  # "rentcast" or "perplexity"


class UnitData(BaseModel):
    """Individual unit data for multi-family properties."""
    beds: int
    baths: Union[int, float]
    sqft: int


class PropertyInfoData(BaseModel):
    """Property information from Rentcast or Gemini."""
    source: str  # "rentcast" or "gemini"
    property_type: Optional[str] = None

    # Rentcast-specific fields
    formatted_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    year_built: Optional[int] = None
    lot_size: Optional[float] = None

    # Common fields
    bedrooms: Optional[int] = None
    bathrooms: Optional[Union[int, float]] = None
    square_footage: Optional[int] = None

    # Multi-family unit breakdown
    total_units: Optional[int] = None
    units: Optional[List[UnitData]] = None

    # Raw data from API
    raw_data: Optional[Dict[str, Any]] = None


class SalesDataEntry(BaseModel):
    """Individual sales data entry."""
    address: str
    sale_date: Optional[str] = None
    sale_price: Optional[Union[str, float]] = None
    sqft: Optional[Union[str, int]] = None
    beds: Optional[Union[str, int]] = None
    baths: Optional[Union[str, float]] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    price_per_sqft: Optional[float] = None  # Calculated field for filtered output


class SalesData(BaseModel):
    """Sales data from Gemini or Rentcast."""
    source: str  # "gemini" or "rentcast"
    sales: List[SalesDataEntry]
    total_count: int


class ApartmentCompEntry(BaseModel):
    """Individual apartment comp entry."""
    address: str
    rent: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[Union[int, float]] = None
    sqft: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    rent_per_sqft: Optional[float] = None  # Calculated field for filtered output


class ApartmentCompData(BaseModel):
    """Apartment comps for a specific unit type."""
    source: str  # "rentcast" or "perplexity"
    unit_beds: int
    unit_baths: Union[int, float]
    unit_sqft: int
    listings: List[ApartmentCompEntry]
    total_count: int


# =============================================================================
# Formatted Output Models
# =============================================================================

class FiveNumberSummaryResult(BaseModel):
    """Five-number summary result from median_analysis."""
    min: Optional[float] = None
    q1: Optional[float] = None
    median: Optional[float] = None
    q3: Optional[float] = None
    max: Optional[float] = None
    count: int
    result_type: str  # "full", "range", or "single"
    field_name: Optional[str] = None
    error_code: Optional[str] = None  # For insufficient data cases


class InputPropertyInfo(BaseModel):
    """Consolidated information about the input property."""
    # Address info
    street: str
    city: str
    state: str
    zip: str

    # Geocoding info
    lat: Optional[float] = None
    lon: Optional[float] = None
    display_name: Optional[str] = None

    # Property details
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[Union[int, float]] = None
    square_footage: Optional[int] = None
    year_built: Optional[int] = None
    lot_size: Optional[float] = None

    # Multi-family specific
    total_units: Optional[int] = None
    units: Optional[List[UnitData]] = None

    # Financial info
    annual_taxes: Optional[float] = None
    tax_year: Optional[int] = None

    # Interest rate
    interest_rate: Optional[float] = None


class FilteredSalesData(BaseModel):
    """Filtered sales data within polygon or by distance fallback."""
    filtered_addresses: List[SalesDataEntry]
    filtered_count: int
    original_count: int
    price_summary: Optional[FiveNumberSummaryResult] = None
    is_expanded: bool = False
    expansion_metadata: Optional[PolygonExpansionMetadata] = None
    filtering_method: str = "polygon"  # "polygon" | "distance_fallback"
    # Tiered filtering tracking
    boundary_included: bool = False  # True if boundary addresses were added due to insufficient inside-only count
    filtering_stage: Optional[str] = None  # "inside_only" | "with_boundary" | "expanded_tier1_2" | "expanded_tier3"


class FilteredApartmentData(BaseModel):
    """Filtered apartment comps within polygon or by distance fallback."""
    unit_key: str  # e.g., "2bd_1ba"
    filtered_addresses: List[ApartmentCompEntry]
    filtered_count: int
    original_count: int
    rent_summary: Optional[FiveNumberSummaryResult] = None
    is_expanded: bool = False
    expansion_metadata: Optional[PolygonExpansionMetadata] = None
    filtering_method: str = "polygon"  # "polygon" | "distance_fallback"
    # Tiered filtering tracking
    boundary_included: bool = False  # True if boundary addresses were added due to insufficient inside-only count
    filtering_stage: Optional[str] = None  # "inside_only" | "with_boundary" | "expanded_tier1_2" | "expanded_tier3"


class FormattedOutput(BaseModel):
    """Formatted and analyzed output data."""
    input_property: Optional[InputPropertyInfo] = None
    sales_data: Optional[FilteredSalesData] = None
    apartment_comps: Optional[Dict[str, FilteredApartmentData]] = None  # Keyed by unit type


# =============================================================================
# Workflow Data Container
# =============================================================================

class WorkflowData(BaseModel):
    """Container for all workflow data."""
    # Input address
    address: NewRentalWorkflowInput

    # Step 1 - Validation
    geocoding: Optional[GeocodingData] = None

    # Workflow 1 - Interest Rate
    interest_rate: Optional[InterestRateData] = None

    # Workflow 2 - Boundary Analysis
    bounding_boxes: Optional[BoundingBoxData] = None
    boundary_polygon: Optional[PolygonData] = None

    # Workflow 3 - Property Data
    property_info: Optional[PropertyInfoData] = None
    property_tax: Optional[PropertyTaxData] = None
    sales_data: Optional[SalesData] = None
    apartment_comps: Optional[Dict[str, ApartmentCompData]] = None  # Keyed by "Xbd_Yba"

    # Post-Processing - Formatted Output
    formatted_output: Optional[FormattedOutput] = None


# =============================================================================
# Output Models
# =============================================================================

class WorkflowOutputMetadata(BaseModel):
    """Metadata for the complete workflow output."""
    total_api_calls: int
    total_execution_time: float  # seconds
    workflow_start_time: str
    workflow_end_time: str
    # step_details excludes 'data' field to avoid duplication with top-level data
    step_details: List[Dict[str, Any]]


class NewRentalWorkflowOutput(BaseModel):
    """Complete output of the new rental workflow."""
    success: bool
    completed_steps: List[str]
    failed_steps: List[str]
    skipped_steps: Optional[List[str]] = None
    data: WorkflowData
    metadata: WorkflowOutputMetadata
    errors: Optional[List[WorkflowError]] = None


# =============================================================================
# Internal State Management
# =============================================================================

class WorkflowState:
    """Internal workflow state for tracking progress."""

    def __init__(
        self,
        input_data: NewRentalWorkflowInput,
        config: WorkflowConfig,
        start_time: float
    ):
        self.input = input_data
        self.config = config
        self.start_time = start_time

        # Initialize step results using enum
        self.steps: Dict[str, WorkflowStepResult] = {
            step.value: WorkflowStepResult(
                step_name=step.value,
                success=False,
                status=WorkflowStepStatus.PENDING
            )
            for step in WorkflowStep
        }

        # Apartment comps stored separately (multiple per workflow)
        self.apartment_comps: Dict[str, WorkflowStepResult] = {}

        # Workflow data accumulator
        self.data = WorkflowData(address=input_data)

        # Thread-safe lock for all mutable state updates
        self._lock = threading.Lock()

        # Metadata tracking
        self.metadata = {
            'total_api_calls': 0,
            'total_execution_time': 0.0
        }

        # Errors list
        self.errors: List[WorkflowError] = []

    # =========================================================================
    # Convenience methods for cleaner step updates
    # =========================================================================

    def complete_step(
        self,
        step: Union[WorkflowStep, str],
        data: Optional[Dict[str, Any]] = None,
        source: str = '',
        api_calls: int = 1,
        step_start: Optional[float] = None
    ) -> None:
        """Mark a step as successfully completed."""
        step_name = step.value if isinstance(step, WorkflowStep) else step
        execution_time = time.time() - step_start if step_start else 0.0

        self.update_step(
            step_name=step_name,
            success=True,
            status=WorkflowStepStatus.COMPLETED,
            data=data,
            metadata=WorkflowStepMetadata(
                api_calls=api_calls,
                execution_time=execution_time,
                source=source
            )
        )

    def fail_step(
        self,
        step: Union[WorkflowStep, str],
        error: str,
        error_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        api_calls: int = 0,
        step_start: Optional[float] = None
    ) -> None:
        """Mark a step as failed."""
        step_name = step.value if isinstance(step, WorkflowStep) else step
        execution_time = time.time() - step_start if step_start else 0.0

        self.update_step(
            step_name=step_name,
            success=False,
            status=WorkflowStepStatus.FAILED,
            error=error,
            error_code=error_code,
            metadata=WorkflowStepMetadata(
                api_calls=api_calls,
                execution_time=execution_time
            )
        )

    # =========================================================================
    # Core update methods
    # =========================================================================

    def update_step(
        self,
        step_name: str,
        success: bool,
        status: WorkflowStepStatus,
        data: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        error_code: Optional[ErrorCode] = None,
        metadata: Optional[WorkflowStepMetadata] = None
    ) -> None:
        """Update a step result (thread-safe)."""
        with self._lock:
            if step_name in self.steps:
                self.steps[step_name] = WorkflowStepResult(
                    step_name=step_name,
                    success=success,
                    status=status,
                    data=data,
                    error=error,
                    error_code=error_code,
                    metadata=metadata
                )

                # Track API calls and execution time
                if metadata:
                    self.metadata['total_api_calls'] += metadata.api_calls
                    self.metadata['total_execution_time'] += metadata.execution_time

                # Track errors
                if not success and error:
                    self.errors.append(WorkflowError(
                        step=step_name,
                        error=error,
                        code=error_code
                    ))

    def skip_step(
        self,
        step: Union[WorkflowStep, str],
        reason: str,
        dependency: Optional[str] = None
    ) -> None:
        """Mark a step as skipped due to a failed dependency (thread-safe)."""
        step_name = step.value if isinstance(step, WorkflowStep) else step
        error_code = ErrorCode.DEPENDENCY_FAILED if dependency else ErrorCode.SKIPPED

        with self._lock:
            if step_name in self.steps:
                self.steps[step_name] = WorkflowStepResult(
                    step_name=step_name,
                    success=False,
                    status=WorkflowStepStatus.SKIPPED,
                    error=reason,
                    error_code=error_code
                )
            else:
                # For apartment comps or other dynamic steps
                self.errors.append(WorkflowError(
                    step=step_name,
                    error=reason,
                    code=error_code
                ))

    def add_apartment_comp_step(
        self,
        unit_key: str,
        success: bool,
        status: WorkflowStepStatus,
        data: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        error_code: Optional[ErrorCode] = None,
        metadata: Optional[WorkflowStepMetadata] = None
    ) -> None:
        """Add an apartment comp step result (thread-safe)."""
        step_name = f"apartment_comps_{unit_key}"

        with self._lock:
            self.apartment_comps[unit_key] = WorkflowStepResult(
                step_name=step_name,
                success=success,
                status=status,
                data=data,
                error=error,
                error_code=error_code,
                metadata=metadata
            )

            # Track metadata
            if metadata:
                self.metadata['total_api_calls'] += metadata.api_calls
                self.metadata['total_execution_time'] += metadata.execution_time

            # Track errors
            if not success and error:
                self.errors.append(WorkflowError(
                    step=step_name,
                    error=error,
                    code=error_code
                ))

    def complete_apartment_comp(
        self,
        unit_key: str,
        data: Dict[str, Any],
        source: str,
        api_calls: int,
        step_start: float
    ) -> None:
        """Mark an apartment comp step as completed."""
        self.add_apartment_comp_step(
            unit_key=unit_key,
            success=True,
            status=WorkflowStepStatus.COMPLETED,
            data=data,
            metadata=WorkflowStepMetadata(
                api_calls=api_calls,
                execution_time=time.time() - step_start,
                source=source
            )
        )

    def fail_apartment_comp(
        self,
        unit_key: str,
        error: str,
        error_code: ErrorCode,
        api_calls: int,
        step_start: float
    ) -> None:
        """Mark an apartment comp step as failed."""
        self.add_apartment_comp_step(
            unit_key=unit_key,
            success=False,
            status=WorkflowStepStatus.FAILED,
            error=error,
            error_code=error_code,
            metadata=WorkflowStepMetadata(
                api_calls=api_calls,
                execution_time=time.time() - step_start
            )
        )
