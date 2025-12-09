"""
New Rental Workflow Lambda Handler
Entry point for the new rental property data gathering workflow using ThreadPoolExecutor.
Supports both synchronous (GraphQL) and asynchronous (job-based) invocation.
"""

import json
import logging
import os
import time
from typing import Dict, Any, Optional
from datetime import datetime

# Lambda automatically sets /var/task/ in sys.path, but we ensure it's there
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import boto3
from botocore.exceptions import ClientError

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

# DynamoDB client for job status updates
dynamodb = boto3.resource('dynamodb')
WORKFLOW_JOB_TABLE = os.environ.get('WORKFLOW_JOB_TABLE_NAME', '')


def update_job_status(
    job_id: str,
    status: str,
    current_step: Optional[str] = None,
    completed_steps: Optional[list] = None,
    result: Optional[Dict] = None,
    metadata: Optional[Dict] = None,
    error: Optional[str] = None
) -> None:
    """Update the job status in DynamoDB."""
    if not WORKFLOW_JOB_TABLE or not job_id:
        logger.warning('No job table or job ID, skipping status update')
        return

    try:
        table = dynamodb.Table(WORKFLOW_JOB_TABLE)
        now = datetime.utcnow().isoformat() + 'Z'

        update_expr = 'SET #status = :status, updated_at = :updated_at'
        expr_names = {'#status': 'status'}
        expr_values = {':status': status, ':updated_at': now}

        if current_step is not None:
            update_expr += ', current_step = :current_step'
            expr_values[':current_step'] = current_step

        if completed_steps is not None:
            update_expr += ', completed_steps = :completed_steps'
            # a.json() fields must be stored as JSON strings
            expr_values[':completed_steps'] = json.dumps(completed_steps)

        if result is not None:
            update_expr += ', #result = :result'
            expr_names['#result'] = 'result'
            # a.json() fields must be stored as JSON strings
            expr_values[':result'] = json.dumps(result) if not isinstance(result, str) else result

        if metadata is not None:
            update_expr += ', metadata = :metadata'
            # a.json() fields must be stored as JSON strings
            expr_values[':metadata'] = json.dumps(metadata) if not isinstance(metadata, str) else metadata

        if error is not None:
            update_expr += ', #error = :error'
            expr_names['#error'] = 'error'
            expr_values[':error'] = error

        table.update_item(
            Key={'id': job_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values
        )
        logger.info(f'Job {job_id} status updated: {status}, step: {current_step}')

    except ClientError as e:
        logger.error(f'Failed to update job status: {e}')
    except Exception as e:
        logger.error(f'Unexpected error updating job status: {e}')


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    """
    Lambda handler function.
    Supports both synchronous (GraphQL) and asynchronous (job-based) invocation.

    Args:
        event: The input event containing address information
            Required fields:
                - street: Street address
                - city: City name
                - state: State name or abbreviation
                - zip: 5-digit ZIP code
            Optional fields:
                - jobId: Job ID for async invocation (updates DynamoDB with progress)
                - userId: User ID for async invocation
                - config: Configuration overrides
        _context: Lambda context object (unused)

    Returns:
        The workflow output with all gathered property data or error response
    """
    logger.info(f'New Rental Workflow started: {json.dumps(event)}')
    start_time = time.time()

    # Detect invocation type
    is_graphql = isinstance(event, dict) and 'arguments' in event and 'jobId' not in event
    is_async_job = isinstance(event, dict) and 'jobId' in event

    # Extract job ID for async invocation
    job_id = event.get('jobId') if is_async_job else None
    completed_steps = []

    # Progress callback for async jobs
    def on_step_complete(step_name: str):
        if job_id:
            completed_steps.append(step_name)
            update_job_status(
                job_id=job_id,
                status='processing',
                current_step=step_name,
                completed_steps=completed_steps
            )

    try:
        # Parse the input
        if isinstance(event, str):
            input_data = json.loads(event)
        else:
            input_data = event

        # Unwrap arguments for GraphQL or async invocation
        if is_graphql:
            input_data = input_data['arguments']
        elif is_async_job and 'arguments' in input_data:
            input_data = input_data['arguments']

        # Update job status to processing
        if job_id:
            update_job_status(
                job_id=job_id,
                status='processing',
                current_step='initializing'
            )

        # Validate required address fields
        validation = validate_input(input_data, ['street', 'city', 'state', 'zip'])
        if not validation['is_valid']:
            error_msg = f"Missing required address fields: {', '.join(validation['missing_fields'])}"
            logger.error(f"Validation failed: {validation['missing_fields']}")
            if is_graphql:
                return {
                    "success": False,
                    "formattedOutput": None,
                    "metadata": None,
                    "error": error_msg
                }
            return create_error_response(
                error_msg,
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
            error_msg = str(error)
            logger.error(f'Configuration error: {error}')
            if is_graphql:
                return {
                    "success": False,
                    "formattedOutput": None,
                    "metadata": None,
                    "error": error_msg
                }
            return create_error_response(
                error_msg,
                ErrorCode.CONFIG_ERROR
            ).model_dump(exclude_none=True)
        except Exception as error:
            error_msg = f'Failed to initialize API clients: {str(error)}'
            logger.error(f'Failed to retrieve API clients: {error}', exc_info=True)
            if is_graphql:
                return {
                    "success": False,
                    "formattedOutput": None,
                    "metadata": None,
                    "error": error_msg
                }
            return create_error_response(
                error_msg,
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
        # Pass the progress callback for async jobs to update DynamoDB
        result = orchestrator.execute(
            {
                'street': input_data['street'],
                'city': input_data['city'],
                'state': input_data['state'],
                'zip': input_data['zip']
            },
            on_step_complete=on_step_complete if job_id else None
        )

        # Log execution summary
        total_time = int((time.time() - start_time) * 1000)
        logger.info(
            f'Workflow completed: success={result.get("success")}, '
            f'completed_steps={result.get("completed_steps")}, '
            f'failed_steps={result.get("failed_steps")}, '
            f'total_api_calls={result.get("metadata", {}).get("total_api_calls")}, '
            f'total_execution_time={total_time}ms'
        )

        # For async jobs, update DynamoDB with final result
        if job_id:
            final_status = 'completed' if result.get('success') else 'failed'
            # Extract formatted output for the result field
            formatted_output = result.get('data', {}).get('formatted_output')
            update_job_status(
                job_id=job_id,
                status=final_status,
                current_step='complete',
                completed_steps=result.get('completed_steps', []),
                result=formatted_output,
                metadata=result.get('metadata'),
                error=json.dumps(result.get('errors')) if result.get('errors') else None
            )
            # Async invocation doesn't need to return anything meaningful
            return {'success': True, 'jobId': job_id}

        # Return trimmed response for GraphQL, full response for direct invocation
        if is_graphql:
            return {
                "success": result.get("success", False),
                "formattedOutput": result.get("data", {}).get("formatted_output"),
                "metadata": result.get("metadata"),
                "error": json.dumps(result.get("errors")) if result.get("errors") else None
            }

        return result

    except Exception as error:
        error_msg = str(error)
        logger.error(f'Handler error: {error}', exc_info=True)

        # For async jobs, update DynamoDB with error
        if job_id:
            update_job_status(
                job_id=job_id,
                status='failed',
                current_step='error',
                error=error_msg
            )
            return {'success': False, 'jobId': job_id, 'error': error_msg}

        if is_graphql:
            return {
                "success": False,
                "formattedOutput": None,
                "metadata": None,
                "error": error_msg
            }
        return create_error_response(
            error_msg,
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
