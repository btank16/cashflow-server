"""
Type definitions for the Rental Workflow Lambda function.
Orchestrates multiple property data gathering functions.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel


class RentalWorkflowInput(BaseModel):
    """Input for the rental workflow - address information."""
    street: str
    city: str
    state: str
    zip: str


class WorkflowConfig(BaseModel):
    """Configuration options for the rental workflow."""
    default_down_payment: float = 20.0
    default_loan_type: str = "30-year fixed"
    max_zillow_results: int = 50
    zillow_days_back: str = "30"


class WorkflowStepMetadata(BaseModel):
    """Metadata for a workflow step."""
    api_calls: Optional[int] = None
    execution_time: Optional[int] = None
    model: Optional[str] = None
    search_domains: Optional[List[str]] = None
    retry_attempted: Optional[bool] = None


class WorkflowStepResult(BaseModel):
    """Result of a single workflow step."""
    step_name: str
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    metadata: Optional[WorkflowStepMetadata] = None


class WorkflowOutputMetadata(BaseModel):
    """Metadata for the complete workflow output."""
    total_api_calls: int
    total_execution_time: int
    workflow_start_time: str
    workflow_end_time: str
    is_metro_area: Optional[bool] = None
    step_details: List[WorkflowStepResult]


class WorkflowError(BaseModel):
    """Error information from a workflow step."""
    step: str
    error: str
    code: Optional[str] = None


class RentalWorkflowOutput(BaseModel):
    """Complete output of the rental workflow."""
    success: bool
    completed_steps: List[str]
    failed_steps: List[str]
    skipped_steps: Optional[List[str]] = None
    data: Dict[str, Any]
    metadata: WorkflowOutputMetadata
    errors: Optional[List[WorkflowError]] = None


class WorkflowState:
    """Internal workflow state for tracking progress."""

    def __init__(
        self,
        input_data: RentalWorkflowInput,
        config: WorkflowConfig,
        start_time: float
    ):
        self.input = input_data
        self.config = config
        self.start_time = start_time

        # Phase 1 steps
        self.steps: Dict[str, Any] = {
            'county': WorkflowStepResult(step_name='county', success=False),
            'neighborhood': WorkflowStepResult(step_name='neighborhood', success=False),
            'propertyInfo': WorkflowStepResult(step_name='propertyInfo', success=False),
            'apartmentComps': {}
        }

        # Metadata tracking
        self.metadata = {
            'total_api_calls': 0,
            'total_execution_time': 0
        }
