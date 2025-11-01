"""
Rental Workflow Lambda Handler
Entry point for the rental property data gathering workflow.
"""

import asyncio
import json
import logging
import os
import time
from typing import Dict, Any

# Add parent directory to path for imports
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from propertyDataGather.common import PerplexityClient, validate_input, create_error_response
from orchestrator import RentalWorkflowOrchestrator

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler function.

    Args:
        event: The input event containing address information
        context: Lambda context object

    Returns:
        The workflow output with all gathered property data or error response
    """
    logger.info(f'Rental Workflow started: {json.dumps(event)}')
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
                'VALIDATION_ERROR'
            )

        # Get the API key
        api_key = os.environ.get('PERPLEXITY_API_KEY')
        if not api_key:
            logger.error('Perplexity API key not configured')
            return create_error_response(
                'Perplexity API key not configured',
                'CONFIG_ERROR'
            )

        # Initialize Perplexity client
        client = PerplexityClient(api_key)

        # Initialize and execute the workflow orchestrator
        orchestrator = RentalWorkflowOrchestrator(client, input_data)

        # Run the async workflow
        result = asyncio.run(orchestrator.execute())

        # Log execution summary
        logger.info(f'Workflow completed: success={result.get("success")}, '
                   f'completed_steps={result.get("completedSteps")}, '
                   f'failed_steps={result.get("failedSteps")}, '
                   f'total_api_calls={result.get("metadata", {}).get("totalApiCalls")}, '
                   f'total_execution_time={int((time.time() - start_time) * 1000)}ms')

        # Return the workflow result directly
        return result

    except Exception as error:
        logger.error(f'Handler error: {error}', exc_info=True)

        # Return error using standard error response format
        return create_error_response(
            str(error),
            'HANDLER_ERROR'
        )
