"""Logging utilities for Lambda functions."""

import logging
from typing import Dict, Any, List, Optional


# =============================================================================
# Workflow Logging Functions
# =============================================================================

def log_workflow_start(
    event: Dict[str, Any],
    workflow_name: str,
    logger: logging.Logger
) -> None:
    """
    Log workflow start with event details.

    Args:
        event: The incoming event
        workflow_name: Name of the workflow for logging
        logger: Logger instance
    """
    street = event.get('street', 'unknown')
    city = event.get('city', 'unknown')
    state = event.get('state', 'unknown')
    zip_code = event.get('zip', event.get('zipCode', 'unknown'))

    logger.info(
        f"{workflow_name} started: "
        f"street={street}, city={city}, state={state}, zip={zip_code}"
    )


def log_workflow_complete(
    workflow_name: str,
    success: bool,
    completed_steps: List[str],
    failed_steps: List[str],
    api_calls: int,
    execution_time_ms: int,
    logger: logging.Logger
) -> None:
    """
    Log workflow completion with metrics only.

    Args:
        workflow_name: Name of the workflow
        success: Whether workflow succeeded
        completed_steps: List of completed step names
        failed_steps: List of failed step names
        api_calls: Total API calls made
        execution_time_ms: Total execution time in milliseconds
        logger: Logger instance
    """
    status = 'completed' if success else 'failed'
    logger.info(
        f"{workflow_name} {status}: "
        f"steps_completed={len(completed_steps)}, "
        f"steps_failed={len(failed_steps)}, "
        f"api_calls={api_calls}, "
        f"execution_time_ms={execution_time_ms}"
    )

    if failed_steps:
        logger.warning(f"{workflow_name} failed steps: {', '.join(failed_steps)}")


def log_step_start(
    step_name: str,
    logger: logging.Logger,
    extra_context: Optional[Dict[str, Any]] = None
) -> None:
    """
    Log the start of a workflow step.

    Args:
        step_name: Name of the step
        logger: Logger instance
        extra_context: Optional context to include
    """
    if extra_context:
        logger.info(f"Step '{step_name}' starting: {extra_context}")
    else:
        logger.info(f"Step '{step_name}' starting")


def log_step_complete(
    step_name: str,
    success: bool,
    execution_time_ms: int,
    logger: logging.Logger,
    error: Optional[str] = None
) -> None:
    """
    Log the completion of a workflow step.

    Args:
        step_name: Name of the step
        success: Whether step succeeded
        execution_time_ms: Execution time in milliseconds
        logger: Logger instance
        error: Error message if failed
    """
    status = 'completed' if success else 'failed'

    if success:
        logger.info(f"Step '{step_name}' {status} in {execution_time_ms}ms")
    else:
        # Truncate long error messages
        safe_error = error[:200] if error else 'unknown error'
        logger.warning(f"Step '{step_name}' {status} in {execution_time_ms}ms: {safe_error}")


def log_api_call(
    service_name: str,
    endpoint: str,
    logger: logging.Logger,
    response_time_ms: Optional[int] = None,
    success: bool = True
) -> None:
    """
    Log an external API call.

    Args:
        service_name: Name of the service (e.g., 'rentcast', 'nominatim')
        endpoint: API endpoint called
        logger: Logger instance
        response_time_ms: Response time if available
        success: Whether call succeeded
    """
    status = 'success' if success else 'failed'
    time_info = f" in {response_time_ms}ms" if response_time_ms else ""

    logger.debug(f"API call to {service_name} ({endpoint}) {status}{time_info}")


# =============================================================================
# Error Logging Functions
# =============================================================================

def log_error_safely(
    error: Exception,
    context: str,
    logger: logging.Logger,
    include_traceback: bool = True
) -> None:
    """
    Log an error with truncated message to avoid excessively long logs.

    Args:
        error: The exception that occurred
        context: Description of what was happening
        logger: Logger instance
        include_traceback: Whether to include stack trace
    """
    # Truncate long error messages
    error_type = type(error).__name__
    error_msg = str(error)[:200] if str(error) else 'no message'

    logger.error(
        f"{context}: {error_type} - {error_msg}",
        exc_info=include_traceback
    )


def create_safe_error_context(
    error: Exception,
    step_name: Optional[str] = None,
    service_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a safe error context dict for structured logging.

    Args:
        error: The exception
        step_name: Optional workflow step name
        service_name: Optional service name

    Returns:
        Safe context dict
    """
    context = {
        'error_type': type(error).__name__,
        'error_message': str(error)[:200] if str(error) else 'no message'
    }

    if step_name:
        context['step'] = step_name
    if service_name:
        context['service'] = service_name

    return context
