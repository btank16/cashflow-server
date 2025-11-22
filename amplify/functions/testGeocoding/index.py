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
from propertyDataGather.functions.osm_fetcher import fetch_osm_ways
from propertyDataGather.functions.boundary_builder import build_boundary_polygon
from propertyDataGather.functions.address_checker import check_addresses_against_polygon
from propertyDataGather.common.utils import validate_input, create_error_response
from propertyDataGather.common.types import ErrorCode

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    """
    Lambda handler function supporting multiple testing modes:
    1. Regular geocoding (single address)
    2. OSM boundary testing (multiple addresses with polygon detection)

    Args:
        event: The input event with different formats based on mode
        _context: Lambda context object (unused)

    Returns:
        Results based on the testing mode

    Example events:
        Regular geocoding:
        {
            "street": "2179 West 106th Street",
            "city": "Cleveland",
            "state": "OH",
            "zip": "44102"
        }

        OSM boundary testing:
        {
            "osm_boundary_test": true,
            "target_address": {
                "street": "2179 West 106th Street",
                "city": "Cleveland",
                "state": "OH",
                "zip": "44102"
            },
            "test_addresses": [
                {"street": "2185 West 106th Street", "city": "Cleveland", "state": "OH", "zip": "44102"},
                {"street": "1234 Main Street", "city": "Cleveland", "state": "OH", "zip": "44102"}
            ]
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

        # Check if OSM boundary testing mode
        if input_data.get('osm_boundary_test'):
            return handle_osm_boundary_test(input_data, start_time)
        else:
            return handle_regular_geocoding(input_data, start_time)

    except Exception as error:
        logger.error(f'Handler error: {error}', exc_info=True)
        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR
        ).model_dump(exclude_none=True)


def handle_regular_geocoding(input_data: Dict[str, Any], start_time: float) -> Dict[str, Any]:
    """
    Handle regular geocoding mode - geocodes single address and returns both
    coordinates and zip bounding box.
    """
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

    return response


def handle_osm_boundary_test(input_data: Dict[str, Any], start_time: float) -> Dict[str, Any]:
    """
    Handle OSM boundary testing mode - builds polygon from OSM ways and tests
    multiple addresses against it.
    """
    # Validate required fields for OSM boundary test
    validation = validate_input(input_data, ['target_address', 'test_addresses'])
    if not validation['is_valid']:
        logger.error(f"Validation failed: {validation['missing_fields']}")
        return create_error_response(
            f"Missing required fields for OSM boundary test: {', '.join(validation['missing_fields'])}",
            ErrorCode.VALIDATION_ERROR
        ).model_dump(exclude_none=True)

    target_address = input_data['target_address']
    test_addresses = input_data['test_addresses']

    logger.info(f'OSM Boundary Test: target_address={target_address}, test_count={len(test_addresses)}')

    # Step 1: Geocode target address
    logger.info('Step 1: Geocoding target address')
    target_geo_result = get_coordinates(target_address)

    if not target_geo_result.success:
        return {
            'success': False,
            'error': 'Failed to geocode target address',
            'target_geocoding': target_geo_result.model_dump(exclude_none=True)
        }

    target_lat = float(target_geo_result.data['lat'])
    target_lon = float(target_geo_result.data['lon'])
    logger.info(f'Target coordinates: ({target_lon}, {target_lat})')

    # Step 2: Geocode test addresses
    logger.info(f'Step 2: Geocoding {len(test_addresses)} test addresses')
    test_geo_results = []
    geocoded_test_addresses = []

    for i, addr in enumerate(test_addresses):
        result = get_coordinates(addr)
        test_geo_results.append(result)

        if result.success:
            geocoded_test_addresses.append({
                'index': i,
                'original': addr,
                'lat': float(result.data['lat']),
                'lon': float(result.data['lon']),
                'display_name': result.data.get('display_name', '')
            })
        else:
            logger.warning(f'Failed to geocode test address {i}: {result.error}')

    logger.info(f'Successfully geocoded {len(geocoded_test_addresses)}/{len(test_addresses)} test addresses')

    # Step 3: Get bounding box for zip code
    logger.info('Step 3: Getting bounding box for zip code')
    bbox_result = get_zip_bounding_box({
        'zip': target_address['zip'],
        'country': 'us'
    })

    if not bbox_result.success:
        return {
            'success': False,
            'error': 'Failed to get bounding box for zip code',
            'bbox_result': bbox_result.model_dump(exclude_none=True)
        }

    bbox = [float(x) for x in bbox_result.data['boundingbox']]
    logger.info(f'Bounding box: {bbox}')

    # Step 4: Fetch OSM ways
    logger.info('Step 4: Fetching OSM ways from Overpass API')
    osm_result = fetch_osm_ways({'bbox': bbox})

    if not osm_result.success:
        return {
            'success': False,
            'error': 'Failed to fetch OSM ways',
            'osm_result': osm_result.model_dump(exclude_none=True)
        }

    logger.info(f'Fetched {osm_result.data["stats"]["total"]} OSM ways')

    # Step 5: Build polygon boundary
    logger.info('Step 5: Building polygon boundary')
    polygon_result = build_boundary_polygon(
        osm_result.data['ways'],
        bbox,
        (target_lon, target_lat)
    )

    if not polygon_result.success:
        return {
            'success': False,
            'error': 'Failed to build polygon boundary',
            'polygon_result': polygon_result.model_dump(exclude_none=True)
        }

    selected_polygon = polygon_result.data['polygon']
    logger.info(f'Selected polygon from {polygon_result.data["total_polygons_found"]} candidates')

    # Step 6: Test addresses against polygon
    logger.info('Step 6: Testing addresses against polygon')
    check_result = check_addresses_against_polygon({
        'polygon': selected_polygon,
        'addresses': geocoded_test_addresses
    })

    if not check_result.success:
        return {
            'success': False,
            'error': 'Failed to check addresses against polygon',
            'check_result': check_result.model_dump(exclude_none=True)
        }

    # Calculate total execution time
    execution_time_ms = int((time.time() - start_time) * 1000)
    logger.info(f'OSM boundary test completed in {execution_time_ms}ms')

    # Build comprehensive response
    response = {
        'success': True,
        'mode': 'osm_boundary_test',
        'target_address': {
            'input': target_address,
            'coordinates': {
                'lat': target_lat,
                'lon': target_lon
            },
            'geocoding_result': target_geo_result.model_dump(exclude_none=True)
        },
        'selected_polygon': selected_polygon,
        'polygon_stats': {
            'total_polygons_found': polygon_result.data['total_polygons_found'],
            'area_sq_km': selected_polygon['properties']['area_sq_km'],
            'num_vertices': selected_polygon['properties']['num_vertices']
        },
        'address_classification': {
            'inside': check_result.data['inside'],
            'outside': check_result.data['outside'],
            'boundary': check_result.data['boundary'],
            'summary': check_result.data['summary']
        },
        'osm_data': {
            'ways_fetched': osm_result.data['stats'],
            'bbox_used': bbox
        },
        'metadata': {
            'total_execution_time': execution_time_ms / 1000.0,
            'total_api_calls': (
                1 + len(test_addresses) +  # Geocoding calls
                1 +  # Bbox call
                1    # OSM fetch call
            ),
            'test_addresses_count': len(test_addresses),
            'geocoded_count': len(geocoded_test_addresses)
        }
    }

    return response
