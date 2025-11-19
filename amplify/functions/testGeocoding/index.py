"""
Test Lambda Handler for Geocoding Function
Simple lambda to test the geocoding.py function
"""

import json
import logging
import time
from typing import Dict, Any

# Lambda automatically sets /var/task/ in sys.path
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from propertyDataGather.functions.geocoding import get_coordinates
from propertyDataGather.common.utils import validate_input, create_error_response
from propertyDataGather.common.types import ErrorCode

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    """
    Lambda handler function to test geocoding.

    Args:
        event: The input event containing address information
               Required: street, city, state
               Optional: zip
        _context: Lambda context object (unused)

    Returns:
        The geocoding result with coordinates or error response

    Example event:
        {
            "street": "1600 Amphitheatre Parkway",
            "city": "Mountain View",
            "state": "CA",
            "zip": "94043"
        }
    """
    logger.info(f'Test Geocoding Lambda started: {json.dumps(event)}')
    start_time = time.time()

    try:
        # Parse the input
        if isinstance(event, str):
            input_data = json.loads(event)
        else:
            input_data = event

        # Validate required address fields
        validation = validate_input(input_data, ['street', 'city', 'state'])
        if not validation['is_valid']:
            logger.error(f"Validation failed: {validation['missing_fields']}")
            return create_error_response(
                f"Missing required address fields: {', '.join(validation['missing_fields'])}",
                ErrorCode.VALIDATION_ERROR
            ).model_dump(exclude_none=True)

        # Call the geocoding function
        result = get_coordinates(input_data)

        # Log execution summary
        execution_time_ms = int((time.time() - start_time) * 1000)
        logger.info(f'Geocoding completed: success={result.success}, '
                   f'execution_time={execution_time_ms}ms')

        if result.success and result.data:
            logger.info(f'Coordinates: lat={result.data.get("latitude")}, '
                       f'lon={result.data.get("longitude")}')

        # Add execution time to metadata
        if result.metadata:
            result.metadata.execution_time = execution_time_ms / 1000.0

        # Return FunctionResult as dictionary
        return result.model_dump(exclude_none=True)

    except Exception as error:
        logger.error(f'Handler error: {error}', exc_info=True)

        # Return error using standard error response format
        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR
        ).model_dump(exclude_none=True)
