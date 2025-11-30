"""Logging utilities with PII protection for Lambda functions."""

import hashlib
import logging
from typing import Dict, Any, List, Optional, Set

# =============================================================================
# Configuration
# =============================================================================

# Fields that should never be logged in full (PII)
PII_FIELDS: Set[str] = {
    'street',
    'address',
    'street_address',
    'full_address',
    'addressLine1',
    'addressLine2',
    'formattedAddress'
}

# Fields that are safe to log
SAFE_FIELDS: Set[str] = {
    'city',
    'state',
    'zip',
    'zipCode',
    'county',
    'config',
    'property_type',
    'propertyType',
    'bedrooms',
    'bathrooms'
}


# =============================================================================
# PII Masking Functions
# =============================================================================

def mask_pii(value: str, show_chars: int = 4) -> str:
    """
    Mask a PII value, showing only last N characters.

    Args:
        value: The sensitive value to mask
        show_chars: Number of characters to show at end

    Returns:
        Masked string like "***Main St"
    """
    if not value or len(value) <= show_chars:
        return '***'
    return '***' + value[-show_chars:]


def hash_for_correlation(value: str) -> str:
    """
    Create a short hash for log correlation without exposing the value.

    This allows tracking related log entries without exposing PII.

    Args:
        value: Value to hash

    Returns:
        8-character hash string for correlation
    """
    if not value:
        return 'empty'
    return hashlib.sha256(value.encode()).hexdigest()[:8]


def sanitize_for_logging(
    data: Dict[str, Any],
    pii_fields: Optional[Set[str]] = None,
    include_hash: bool = True
) -> Dict[str, Any]:
    """
    Create a log-safe version of a dictionary by masking PII.

    Args:
        data: Original data dict
        pii_fields: Additional fields to treat as PII
        include_hash: Include hash of PII for correlation

    Returns:
        Safe dict for logging
    """
    all_pii_fields = PII_FIELDS | (pii_fields or set())
    safe_data = {}

    for key, value in data.items():
        key_lower = key.lower()

        if key_lower in {f.lower() for f in all_pii_fields}:
            # PII field - redact
            if include_hash and isinstance(value, str):
                safe_data[key] = f"[REDACTED:{hash_for_correlation(value)}]"
            else:
                safe_data[key] = '[REDACTED]'
        elif key_lower in {f.lower() for f in SAFE_FIELDS}:
            # Safe field - include as-is
            safe_data[key] = value
        elif isinstance(value, dict):
            # Recursively sanitize nested dicts
            safe_data[key] = sanitize_for_logging(value, pii_fields, include_hash)
        elif isinstance(value, list):
            # For lists, sanitize each item if it's a dict
            safe_data[key] = [
                sanitize_for_logging(item, pii_fields, include_hash)
                if isinstance(item, dict) else item
                for item in value
            ]
        else:
            # Unknown field - be conservative, filter it
            safe_data[key] = '[FILTERED]'

    return safe_data


# =============================================================================
# Workflow Logging Functions
# =============================================================================

def log_workflow_start(
    event: Dict[str, Any],
    workflow_name: str,
    logger: logging.Logger
) -> None:
    """
    Log workflow start with safe event representation.

    Args:
        event: The incoming event
        workflow_name: Name of the workflow for logging
        logger: Logger instance
    """
    # Log only safe identifiers
    city = event.get('city', 'unknown')
    state = event.get('state', 'unknown')
    zip_code = event.get('zip', event.get('zipCode', 'unknown'))
    street_hash = hash_for_correlation(event.get('street', ''))

    logger.info(
        f"{workflow_name} started: "
        f"city={city}, state={state}, zip={zip_code}, "
        f"address_hash={street_hash}"
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
        extra_context: Optional safe context to include
    """
    if extra_context:
        safe_context = sanitize_for_logging(extra_context, include_hash=False)
        logger.info(f"Step '{step_name}' starting: {safe_context}")
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
        error: Error message if failed (will be sanitized)
    """
    status = 'completed' if success else 'failed'

    if success:
        logger.info(f"Step '{step_name}' {status} in {execution_time_ms}ms")
    else:
        # Sanitize error message in case it contains PII
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
    Log an error safely, avoiding PII in error messages.

    Args:
        error: The exception that occurred
        context: Description of what was happening
        logger: Logger instance
        include_traceback: Whether to include stack trace
    """
    # Error messages might contain addresses or other PII
    # Only log the exception type and first 200 chars of message
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
