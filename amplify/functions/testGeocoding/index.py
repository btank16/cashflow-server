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

from propertyDataGather.functions.geocoding import get_coordinates, get_zip_bounding_box
from propertyDataGather.common.utils import validate_input, create_error_response
from propertyDataGather.common.types import ErrorCode

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    """
    Lambda handler function to test both geocoding and zip bounding box functions.

    Calls both get_coordinates() and get_zip_bounding_box() for a single address query,
    returning results from both functions.

    Args:
        event: The input event containing address information
               Required: street, city, state, zip
        _context: Lambda context object (unused)

    Returns:
        Combined results from both geocoding and zip bounding box functions

    Example event:
        {
            "street": "2179 West 106th Street",
            "city": "Cleveland",
            "state": "OH",
            "zip": "44102"
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
        validation = validate_input(input_data, ['street', 'city', 'state', 'zip'])
        if not validation['is_valid']:
            logger.error(f"Validation failed: {validation['missing_fields']}")
            return create_error_response(
                f"Missing required address fields: {', '.join(validation['missing_fields'])}",
                ErrorCode.VALIDATION_ERROR
            ).model_dump(exclude_none=True)

        # Call both functions
        logger.info('Calling get_coordinates for full address')
        geocode_result = get_coordinates(input_data)

        logger.info('Calling get_zip_bounding_box for zip code')
        bbox_result = get_zip_bounding_box({'zip': input_data['zip'], 'country': 'us'})

        # Log execution summary
        execution_time_ms = int((time.time() - start_time) * 1000)
        logger.info(f'Both functions completed in {execution_time_ms}ms')

        if geocode_result.success and geocode_result.data:
            logger.info(f'Address coordinates: lat={geocode_result.data.get("lat")}, '
                       f'lon={geocode_result.data.get("lon")}')

        if bbox_result.success and bbox_result.data:
            logger.info(f'Zip bounding box: {bbox_result.data.get("boundingbox")}')

        # Build combined response
        response = {
            'success': geocode_result.success or bbox_result.success,
            'geocoding': geocode_result.model_dump(exclude_none=True),
            'zip_bounding_box': bbox_result.model_dump(exclude_none=True),
            'metadata': {
                'total_execution_time': execution_time_ms / 1000.0,
                'total_api_calls': (
                    (geocode_result.metadata.api_calls if geocode_result.metadata else 0) +
                    (bbox_result.metadata.api_calls if bbox_result.metadata else 0)
                )
            }
        }

        # Return combined results
        return response

    except Exception as error:
        logger.error(f'Handler error: {error}', exc_info=True)

        # Return error using standard error response format
        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR
        ).model_dump(exclude_none=True)
