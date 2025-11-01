"""
Workflow Orchestrator
Manages the execution flow of property data gathering functions.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

# Add parent directory to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from propertyDataGather.functions import (
    get_county_name,
    get_neighborhood_name,
    get_initial_property_info,
    get_property_tax,
    get_interest_rate,
    get_apartment_comps,
    search_zillow_by_zip,
    is_valid_city
)
from propertyDataGather.common import PerplexityClient, FunctionResult

from .types import (
    RentalWorkflowInput,
    RentalWorkflowOutput,
    WorkflowConfig,
    WorkflowState,
    WorkflowStepResult,
    WorkflowStepMetadata,
    WorkflowOutputMetadata,
    WorkflowError
)

logger = logging.getLogger(__name__)


class RentalWorkflowOrchestrator:
    """Main orchestrator class for the rental workflow."""

    def __init__(
        self,
        perplexity_client: PerplexityClient,
        apify_client: Any,
        input_data: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None
    ):
        self.client = perplexity_client
        self.apify_client = apify_client

        # Parse input
        workflow_input = RentalWorkflowInput(**input_data)

        # Merge config with defaults
        workflow_config = WorkflowConfig(**(config or {}))

        # Initialize state
        self.state = WorkflowState(
            input_data=workflow_input,
            config=workflow_config,
            start_time=time.time()
        )

    async def execute(self) -> Dict[str, Any]:
        """Execute the complete workflow."""
        workflow_start_time = datetime.now(timezone.utc).isoformat()

        try:
            # Phase 1: Basic property information gathering

            # Step 1: County Lookup (Required for property details)
            await self._execute_county_lookup()

            # Step 2: Check if city is a metro area
            is_metro_area = is_valid_city(self.state.input.city)

            # Step 3: Conditional parallel execution
            if self.state.steps['county'].success:
                await self._execute_parallel_steps(is_metro_area)
            elif is_metro_area:
                # If county failed but it's a metro area, still try neighborhood
                await self._execute_neighborhood_lookup()

            # Phase 2: Market research and comps (only if property info succeeded)
            if self.state.steps['propertyInfo'].success:
                await self._execute_phase2()

            # Generate final output
            return self._generate_output(workflow_start_time, is_metro_area)

        except Exception as error:
            # Handle catastrophic failure
            logger.error(f"Workflow error: {error}", exc_info=True)
            return self._generate_error_output(error, workflow_start_time)

    async def _execute_county_lookup(self) -> None:
        """Execute county lookup."""
        step_start_time = time.time()

        try:
            result = await asyncio.to_thread(
                get_county_name,
                {
                    'city_name': self.state.input.city,
                    'state_name': self.state.input.state
                },
                self.client
            )

            self.state.steps['county'] = WorkflowStepResult(
                step_name='county',
                success=result.success,
                data=result.data if result.success else None,
                error=result.error if not result.success else None,
                error_code=result.error_code if not result.success else None,
                metadata=WorkflowStepMetadata(
                    api_calls=result.metadata.api_calls if result.metadata else None,
                    execution_time=int((time.time() - step_start_time) * 1000),
                    model=result.metadata.model if result.metadata else None,
                    search_domains=result.metadata.search_domains if result.metadata else None
                ) if result.metadata else WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

            self._update_metadata(result)

        except Exception as error:
            logger.error(f"County lookup error: {error}", exc_info=True)
            self.state.steps['county'] = WorkflowStepResult(
                step_name='county',
                success=False,
                error=str(error),
                error_code='EXECUTION_ERROR',
                metadata=WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

    async def _execute_neighborhood_lookup(self) -> None:
        """Execute neighborhood lookup."""
        step_start_time = time.time()

        try:
            result = await asyncio.to_thread(
                get_neighborhood_name,
                {
                    'street': self.state.input.street,
                    'city': self.state.input.city,
                    'state': self.state.input.state,
                    'zip': self.state.input.zip
                },
                self.client
            )

            self.state.steps['neighborhood'] = WorkflowStepResult(
                step_name='neighborhood',
                success=result.success,
                data=result.data if result.success else None,
                error=result.error if not result.success else None,
                error_code=result.error_code if not result.success else None,
                metadata=WorkflowStepMetadata(
                    api_calls=result.metadata.api_calls if result.metadata else None,
                    execution_time=int((time.time() - step_start_time) * 1000),
                    model=result.metadata.model if result.metadata else None,
                    search_domains=result.metadata.search_domains if result.metadata else None
                ) if result.metadata else WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

            self._update_metadata(result)

        except Exception as error:
            logger.error(f"Neighborhood lookup error: {error}", exc_info=True)
            self.state.steps['neighborhood'] = WorkflowStepResult(
                step_name='neighborhood',
                success=False,
                error=str(error),
                error_code='EXECUTION_ERROR',
                metadata=WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

    async def _execute_property_details(self) -> None:
        """Execute property details lookup."""
        step_start_time = time.time()

        try:
            # This requires county_name from the previous step
            county_data = self.state.steps['county'].data
            if not county_data or 'county_name' not in county_data:
                raise ValueError('County name not available for property details lookup')

            result = await asyncio.to_thread(
                get_initial_property_info,
                {
                    'street': self.state.input.street,
                    'city': self.state.input.city,
                    'state': self.state.input.state,
                    'zip': self.state.input.zip,
                    'county_name': county_data['county_name']
                },
                self.client
            )

            self.state.steps['propertyInfo'] = WorkflowStepResult(
                step_name='propertyInfo',
                success=result.success,
                data=result.data if result.success else None,
                error=result.error if not result.success else None,
                error_code=result.error_code if not result.success else None,
                metadata=WorkflowStepMetadata(
                    api_calls=result.metadata.api_calls if result.metadata else None,
                    execution_time=int((time.time() - step_start_time) * 1000),
                    model=result.metadata.model if result.metadata else None,
                    search_domains=result.metadata.search_domains if result.metadata else None
                ) if result.metadata else WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

            self._update_metadata(result)

        except Exception as error:
            logger.error(f"Property details error: {error}", exc_info=True)
            self.state.steps['propertyInfo'] = WorkflowStepResult(
                step_name='propertyInfo',
                success=False,
                error=str(error),
                error_code='EXECUTION_ERROR',
                metadata=WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

    async def _execute_parallel_steps(self, include_neighborhood: bool) -> None:
        """
        Execute parallel steps.

        Args:
            include_neighborhood: Whether to include neighborhood lookup (only for metro areas)
        """
        tasks = [self._execute_property_details()]

        # Only add neighborhood lookup task if city is a metro area
        if include_neighborhood:
            tasks.append(self._execute_neighborhood_lookup())
        else:
            # Mark neighborhood as skipped (not an error)
            self.state.steps['neighborhood'] = WorkflowStepResult(
                step_name='neighborhood',
                success=False,
                error='Skipped - city is not a metro area',
                error_code='SKIPPED',
                metadata=WorkflowStepMetadata(execution_time=0)
            )

        # Execute tasks in parallel using asyncio.gather
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _execute_zillow_search(self) -> None:
        """Execute Zillow ZIP search."""
        step_start_time = time.time()

        try:
            result = await asyncio.to_thread(
                search_zillow_by_zip,
                {
                    'zipCodes': [self.state.input.zip],
                    'daysOnZillow': self.state.config.zillow_days_back,
                    'sold': True,
                    'forSaleByAgent': False,
                    'forSaleByOwner': False,
                    'forRent': False,
                    'maxItems': self.state.config.max_zillow_results
                },
                self.apify_client
            )

            self.state.steps['zillowSearch'] = WorkflowStepResult(
                step_name='zillowSearch',
                success=result.success,
                data=result.data if result.success else None,
                error=result.error if not result.success else None,
                error_code=result.error_code if not result.success else None,
                metadata=WorkflowStepMetadata(
                    api_calls=result.metadata.api_calls if result.metadata else None,
                    execution_time=int((time.time() - step_start_time) * 1000),
                    model=result.metadata.model if result.metadata else None,
                    search_domains=result.metadata.search_domains if result.metadata else None
                ) if result.metadata else WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

            self._update_metadata(result)

        except Exception as error:
            logger.error(f"Zillow search error: {error}", exc_info=True)
            self.state.steps['zillowSearch'] = WorkflowStepResult(
                step_name='zillowSearch',
                success=False,
                error=str(error),
                error_code='EXECUTION_ERROR',
                metadata=WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

    async def _execute_interest_rate(self) -> None:
        """Execute interest rate lookup."""
        step_start_time = time.time()

        try:
            result = await asyncio.to_thread(
                get_interest_rate,
                {
                    'state_name': self.state.input.state,
                    'down_payment': self.state.config.default_down_payment,
                    'loan_type': self.state.config.default_loan_type
                },
                self.client
            )

            self.state.steps['interestRate'] = WorkflowStepResult(
                step_name='interestRate',
                success=result.success,
                data=result.data if result.success else None,
                error=result.error if not result.success else None,
                error_code=result.error_code if not result.success else None,
                metadata=WorkflowStepMetadata(
                    api_calls=result.metadata.api_calls if result.metadata else None,
                    execution_time=int((time.time() - step_start_time) * 1000),
                    model=result.metadata.model if result.metadata else None,
                    search_domains=result.metadata.search_domains if result.metadata else None
                ) if result.metadata else WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

            self._update_metadata(result)

        except Exception as error:
            logger.error(f"Interest rate error: {error}", exc_info=True)
            self.state.steps['interestRate'] = WorkflowStepResult(
                step_name='interestRate',
                success=False,
                error=str(error),
                error_code='EXECUTION_ERROR',
                metadata=WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

    async def _execute_property_tax(self) -> None:
        """Execute property tax lookup."""
        step_start_time = time.time()

        try:
            result = await asyncio.to_thread(
                get_property_tax,
                {
                    'street': self.state.input.street,
                    'city': self.state.input.city,
                    'state': self.state.input.state,
                    'zip': self.state.input.zip,
                    'year': datetime.now().year - 1
                },
                self.client
            )

            self.state.steps['propertyTax'] = WorkflowStepResult(
                step_name='propertyTax',
                success=result.success,
                data=result.data if result.success else None,
                error=result.error if not result.success else None,
                error_code=result.error_code if not result.success else None,
                metadata=WorkflowStepMetadata(
                    api_calls=result.metadata.api_calls if result.metadata else None,
                    execution_time=int((time.time() - step_start_time) * 1000),
                    model=result.metadata.model if result.metadata else None,
                    search_domains=result.metadata.search_domains if result.metadata else None
                ) if result.metadata else WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

            self._update_metadata(result)

        except Exception as error:
            logger.error(f"Property tax error: {error}", exc_info=True)
            self.state.steps['propertyTax'] = WorkflowStepResult(
                step_name='propertyTax',
                success=False,
                error=str(error),
                error_code='EXECUTION_ERROR',
                metadata=WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

    async def _execute_apartment_comp(self, bed: int, bath: int) -> None:
        """
        Execute apartment comp search for a specific bed/bath combination.

        Args:
            bed: Number of bedrooms
            bath: Number of bathrooms
        """
        step_start_time = time.time()
        key = f"{bed}bd_{bath}ba"

        try:
            # Get neighborhood if available
            neighborhood_data = self.state.steps['neighborhood'].data
            neighborhood = neighborhood_data.get('neighborhood') if neighborhood_data else None

            result = await asyncio.to_thread(
                get_apartment_comps,
                {
                    'neighborhood': neighborhood,
                    'city': self.state.input.city,
                    'state': self.state.input.state,
                    'bed_count': bed,
                    'bath_count': bath
                },
                self.client
            )

            self.state.steps['apartmentComps'][key] = WorkflowStepResult(
                step_name=f'apartmentComp_{key}',
                success=result.success,
                data=result.data if result.success else None,
                error=result.error if not result.success else None,
                error_code=result.error_code if not result.success else None,
                metadata=WorkflowStepMetadata(
                    api_calls=result.metadata.api_calls if result.metadata else None,
                    execution_time=int((time.time() - step_start_time) * 1000),
                    model=result.metadata.model if result.metadata else None,
                    search_domains=result.metadata.search_domains if result.metadata else None
                ) if result.metadata else WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

            self._update_metadata(result)

        except Exception as error:
            logger.error(f"Apartment comp {key} error: {error}", exc_info=True)
            self.state.steps['apartmentComps'][key] = WorkflowStepResult(
                step_name=f'apartmentComp_{key}',
                success=False,
                error=str(error),
                error_code='EXECUTION_ERROR',
                metadata=WorkflowStepMetadata(
                    execution_time=int((time.time() - step_start_time) * 1000)
                )
            )

    def _get_unique_bed_bath_combinations(self) -> List[Dict[str, int]]:
        """Get unique bed/bath combinations from property info."""
        property_data = self.state.steps['propertyInfo'].data
        if not property_data or 'unit_bed' not in property_data or 'unit_bath' not in property_data:
            return []

        combinations = {}
        unit_bed = property_data['unit_bed']
        unit_bath = property_data['unit_bath']

        for i in range(len(unit_bed)):
            key = f"{unit_bed[i]}_{unit_bath[i]}"
            if key not in combinations:
                combinations[key] = {
                    'bed': unit_bed[i],
                    'bath': unit_bath[i]
                }

        return list(combinations.values())

    async def _execute_phase2(self) -> None:
        """Execute Phase 2: Parallel execution of market research functions."""
        # Only proceed if we have property info
        if not self.state.steps['propertyInfo'].success:
            return

        # Get unique bed/bath combinations for apartment searches
        unique_combinations = self._get_unique_bed_bath_combinations()

        # Build all parallel tasks
        phase2_tasks = [
            self._execute_zillow_search(),
            self._execute_interest_rate(),
            self._execute_property_tax()
        ]

        # Add apartment comps (one per unique combination)
        for combo in unique_combinations:
            phase2_tasks.append(
                self._execute_apartment_comp(combo['bed'], combo['bath'])
            )

        # Execute all tasks in parallel using asyncio.gather
        await asyncio.gather(*phase2_tasks, return_exceptions=True)

    def _update_metadata(self, result: FunctionResult) -> None:
        """Update workflow metadata from a function result."""
        if result.metadata and result.metadata.api_calls:
            self.state.metadata['total_api_calls'] += result.metadata.api_calls

    def _generate_output(
        self,
        workflow_start_time: str,
        is_metro_area: bool
    ) -> Dict[str, Any]:
        """
        Generate the final workflow output.

        Args:
            workflow_start_time: Workflow start timestamp
            is_metro_area: Whether the city is a metro area

        Returns:
            Complete workflow output dictionary
        """
        workflow_end_time = datetime.now(timezone.utc).isoformat()
        total_execution_time = int((time.time() - self.state.start_time) * 1000)

        # Determine completed, failed, and skipped steps
        completed_steps: List[str] = []
        failed_steps: List[str] = []
        skipped_steps: List[str] = []
        errors: List[WorkflowError] = []

        # Process Phase 1 steps
        for key, step in self.state.steps.items():
            # Skip apartmentComps object - handle it separately
            if key == 'apartmentComps':
                continue

            if isinstance(step, WorkflowStepResult):
                if step.success:
                    completed_steps.append(key)
                elif step.error_code == 'SKIPPED':
                    skipped_steps.append(key)
                elif step.error:
                    failed_steps.append(key)
                    errors.append(WorkflowError(
                        step=key,
                        error=step.error,
                        code=step.error_code
                    ))

        # Process apartment comps separately
        if isinstance(self.state.steps.get('apartmentComps'), dict):
            for key, step in self.state.steps['apartmentComps'].items():
                if step.success:
                    completed_steps.append(f'apartmentComp_{key}')
                elif step.error:
                    failed_steps.append(f'apartmentComp_{key}')
                    errors.append(WorkflowError(
                        step=f'apartmentComp_{key}',
                        error=step.error,
                        code=step.error_code
                    ))

        # Build the data object
        data: Dict[str, Any] = {
            'address': self.state.input.model_dump()
        }

        # Phase 1 data
        if self.state.steps['county'].success and self.state.steps['county'].data:
            data['county'] = self.state.steps['county'].data

        if self.state.steps['neighborhood'].success and self.state.steps['neighborhood'].data:
            data['neighborhood'] = self.state.steps['neighborhood'].data

        if self.state.steps['propertyInfo'].success and self.state.steps['propertyInfo'].data:
            data['propertyInfo'] = self.state.steps['propertyInfo'].data

        # Phase 2 data
        zillow_step = self.state.steps.get('zillowSearch')
        if zillow_step and zillow_step.success and zillow_step.data:
            data['zillowComps'] = zillow_step.data

        interest_step = self.state.steps.get('interestRate')
        if interest_step and interest_step.success and interest_step.data:
            data['interestRate'] = interest_step.data

        tax_step = self.state.steps.get('propertyTax')
        if tax_step and tax_step.success and tax_step.data:
            data['propertyTax'] = tax_step.data

        # Apartment comps - build object from all successful searches
        if isinstance(self.state.steps.get('apartmentComps'), dict):
            apartment_comps_data = {}
            for key, step in self.state.steps['apartmentComps'].items():
                if step.success and step.data:
                    apartment_comps_data[key] = step.data
            if apartment_comps_data:
                data['apartmentComps'] = apartment_comps_data

        # Collect all step details
        step_details: List[WorkflowStepResult] = []

        # Add Phase 1 steps
        for step in self.state.steps.values():
            if isinstance(step, WorkflowStepResult):
                step_details.append(step)

        # Add apartment comp steps
        if isinstance(self.state.steps.get('apartmentComps'), dict):
            for step in self.state.steps['apartmentComps'].values():
                if isinstance(step, WorkflowStepResult):
                    step_details.append(step)

        # Create output
        output = RentalWorkflowOutput(
            success=len(completed_steps) > 0,
            completed_steps=completed_steps,
            failed_steps=failed_steps,
            skipped_steps=skipped_steps if skipped_steps else None,
            data=data,
            metadata=WorkflowOutputMetadata(
                total_api_calls=self.state.metadata['total_api_calls'],
                total_execution_time=total_execution_time,
                workflow_start_time=workflow_start_time,
                workflow_end_time=workflow_end_time,
                is_metro_area=is_metro_area,
                step_details=step_details
            ),
            errors=errors if errors else None
        )

        return output.model_dump(exclude_none=True)

    def _generate_error_output(
        self,
        error: Exception,
        workflow_start_time: str
    ) -> Dict[str, Any]:
        """
        Generate error output for catastrophic failures.

        Args:
            error: The exception that occurred
            workflow_start_time: Workflow start timestamp

        Returns:
            Error output dictionary
        """
        workflow_end_time = datetime.now(timezone.utc).isoformat()
        total_execution_time = int((time.time() - self.state.start_time) * 1000)

        output = RentalWorkflowOutput(
            success=False,
            completed_steps=[],
            failed_steps=['workflow'],
            data={'address': self.state.input.model_dump()},
            metadata=WorkflowOutputMetadata(
                total_api_calls=self.state.metadata['total_api_calls'],
                total_execution_time=total_execution_time,
                workflow_start_time=workflow_start_time,
                workflow_end_time=workflow_end_time,
                step_details=[]
            ),
            errors=[WorkflowError(
                step='workflow',
                error=str(error),
                code='WORKFLOW_ERROR'
            )]
        )

        return output.model_dump(exclude_none=True)
