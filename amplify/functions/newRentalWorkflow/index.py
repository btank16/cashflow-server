"""
New Rental Workflow Lambda Handler
Entry point for the new rental property data gathering workflow using ThreadPoolExecutor.
"""

import json
import logging
import time
from typing import Dict, Any

# Lambda automatically sets /var/task/ in sys.path, but we ensure it's there
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from propertyDataGather.common.utils import (
    validate_input,
    create_error_response
)
from propertyDataGather.common.types import ErrorCode
from propertyDataGather.common.aws_clients import get_all_api_clients_from_env
from orchestrator import NewRentalWorkflowOrchestrator
from workflow_types import WorkflowConfig

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    """
    Lambda handler function.

    Args:
        event: The input event containing address information
            Required fields:
                - street: Street address
                - city: City name
                - state: State name or abbreviation
                - zip: 5-digit ZIP code
            Optional fields:
                - config: Configuration overrides
                    - default_down_payment: Down payment percentage (default: 20.0)
                    - default_loan_type: Loan type (default: "30-year fixed")
                    - sales_time_period: Sales lookup period (default: "6 months")
                    - sqft_tolerance_percent: Sq ft tolerance for rentals (default: 0.10)
                    - search_radius_miles: Search radius (default: 2.0)
        _context: Lambda context object (unused)

    Returns:
        The workflow output with all gathered property data or error response

    Example input:
        {
            "street": "2179 West 106th Street",
            "city": "Cleveland",
            "state": "OH",
            "zip": "44102",
            "config": {
                "default_down_payment": 25.0,
                "sales_time_period": "3 months"
            }
        }

    Example output:
        {
            "success": true,
            "completed_steps": ["validation", "interest_rate", "boundary_analysis", ...],
            "failed_steps": [],
            "data": {
                "address": {...},
                "geocoding": {...},
                "interest_rate": {...},
                "bounding_boxes": {...},
                "boundary_polygon": {...},
                "property_info": {...},
                "property_tax": {...},
                "sales_data": {...},
                "apartment_comps": {...}
            },
            "metadata": {
                "total_api_calls": 15,
                "total_execution_time": 45.2,
                "workflow_start_time": "2025-01-15T10:30:00.000Z",
                "workflow_end_time": "2025-01-15T10:30:45.200Z",
                "step_details": [...]
            },
            "errors": null
        }
    """
    logger.info(f'New Rental Workflow started: {json.dumps(event)}')
    start_time = time.time()

    try:
        # Parse the input
        if isinstance(event, str):
            input_data = json.loads(event)
        else:
            input_data = event

        # Validate required address fields
        validation = validate_input(input_data, ['street', 'city', 'state', 'zip'])
        if not validation['is_valid']:
            logger.error(f"Validation failed: {validation['missing_fields']}")
            return create_error_response(
                f"Missing required address fields: {', '.join(validation['missing_fields'])}",
                ErrorCode.VALIDATION_ERROR
            ).model_dump(exclude_none=True)

        # Parse optional configuration
        config_data = input_data.get('config', {})
        try:
            config = WorkflowConfig(**config_data)
        except Exception as e:
            logger.warning(f"Invalid config, using defaults: {e}")
            config = WorkflowConfig()

        # Retrieve all API clients from SSM Parameter Store in a single batch
        try:
            clients = get_all_api_clients_from_env()
        except ValueError as error:
            logger.error(f'Configuration error: {error}')
            return create_error_response(
                str(error),
                ErrorCode.CONFIG_ERROR
            ).model_dump(exclude_none=True)
        except Exception as error:
            logger.error(f'Failed to retrieve API clients: {error}', exc_info=True)
            return create_error_response(
                f'Failed to initialize API clients: {str(error)}',
                ErrorCode.CONFIG_ERROR
            ).model_dump(exclude_none=True)

        # Initialize the orchestrator
        orchestrator = NewRentalWorkflowOrchestrator(
            perplexity_client=clients.perplexity,
            rentcast_client=clients.rentcast,
            gemini_client=clients.gemini,
            config=config
        )

        # Execute the workflow (synchronous with ThreadPoolExecutor)
        result = orchestrator.execute({
            'street': input_data['street'],
            'city': input_data['city'],
            'state': input_data['state'],
            'zip': input_data['zip']
        })

        # Log execution summary
        total_time = int((time.time() - start_time) * 1000)
        logger.info(
            f'Workflow completed: success={result.get("success")}, '
            f'completed_steps={result.get("completed_steps")}, '
            f'failed_steps={result.get("failed_steps")}, '
            f'total_api_calls={result.get("metadata", {}).get("total_api_calls")}, '
            f'total_execution_time={total_time}ms'
        )

        return result

    except Exception as error:
        logger.error(f'Handler error: {error}', exc_info=True)

        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR
        ).model_dump(exclude_none=True)


# For local testing
if __name__ == '__main__':
    # Test event
    test_event = {
        'street': '2179 West 106th Street',
        'city': 'Cleveland',
        'state': 'OH',
        'zip': '44102'
    }

    # Note: This requires AWS credentials and SSM parameters to be configured
    result = handler(test_event, None)
    print(json.dumps(result, indent=2, default=str))
