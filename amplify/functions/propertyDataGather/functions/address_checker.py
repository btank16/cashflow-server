"""Address checking functions for polygon boundary containment testing."""

from typing import Dict, Any, List, Tuple
from shapely.geometry import Point, shape
import logging

from ..common.types import FunctionResult, ErrorCode
from ..common.utils import (
    validate_input,
    create_error_response,
    create_success_response,
    measure_execution_time
)
from ..common.osm_config import BOUNDARY_BUFFER_DISTANCE

logger = logging.getLogger(__name__)


def _classify_point(
    point: Point,
    polygon_shape: Any,
    boundary_buffer: float = BOUNDARY_BUFFER_DISTANCE
) -> str:
    """
    Classify a point as inside, outside, or on the boundary of a polygon.

    Args:
        point: Shapely Point to classify
        polygon_shape: Shapely Polygon or shape object
        boundary_buffer: Distance threshold for boundary detection (degrees)

    Returns:
        Classification: 'inside', 'outside', or 'boundary'
    """
    # Check if point is inside the polygon
    if polygon_shape.contains(point):
        return 'inside'

    # Check if point is on or very close to the boundary
    distance_to_boundary = polygon_shape.boundary.distance(point)
    if distance_to_boundary < boundary_buffer:
        return 'boundary'

    # Point is outside
    return 'outside'


@measure_execution_time
def check_addresses_against_polygon(
    input_data: Dict[str, Any]
) -> FunctionResult[Dict[str, Any]]:
    """
    Test multiple addresses against a polygon boundary.

    Args:
        input_data: Dictionary containing:
            - polygon: GeoJSON polygon (from boundary_builder)
            - addresses: List of address dicts with lat/lon coordinates

    Returns:
        FunctionResult with addresses classified by location:
        - inside: List of addresses within polygon
        - outside: List of addresses outside polygon
        - boundary: List of addresses on polygon boundary

    Example:
        >>> input_data = {
        ...     "polygon": {...},  # GeoJSON polygon
        ...     "addresses": [
        ...         {"lat": 41.476, "lon": -81.786, "street": "2029 Elbur Ave"},
        ...         {"lat": 41.480, "lon": -81.790, "street": "1234 Main St"}
        ...     ]
        ... }
        >>> result = check_addresses_against_polygon(input_data)
        >>> if result.success:
        ...     inside = result.data['inside']
        ...     outside = result.data['outside']
    """
    # Validate input
    validation = validate_input(input_data, ['polygon', 'addresses'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    try:
        polygon_geojson = input_data['polygon']
        addresses = input_data['addresses']

        # Validate polygon format
        if not isinstance(polygon_geojson, dict):
            return create_error_response(
                "Polygon must be a GeoJSON object",
                ErrorCode.VALIDATION_ERROR
            )

        # Convert GeoJSON to Shapely polygon
        try:
            # Handle both Feature and Geometry formats
            if polygon_geojson.get('type') == 'Feature':
                polygon_shape = shape(polygon_geojson['geometry'])
            else:
                polygon_shape = shape(polygon_geojson)
        except Exception as e:
            return create_error_response(
                f"Failed to parse polygon GeoJSON: {str(e)}",
                ErrorCode.VALIDATION_ERROR
            )

        # Validate addresses format
        if not isinstance(addresses, list):
            return create_error_response(
                "Addresses must be a list",
                ErrorCode.VALIDATION_ERROR
            )

        # Classify each address
        inside = []
        outside = []
        boundary = []
        errors = []

        for i, address in enumerate(addresses):
            try:
                # Validate address has required coordinates
                if 'lat' not in address or 'lon' not in address:
                    logger.warning(f"Address {i} missing lat/lon coordinates, skipping")
                    errors.append({
                        'index': i,
                        'address': address,
                        'error': 'Missing lat/lon coordinates'
                    })
                    continue

                # Create point (lon, lat order for Shapely)
                point = Point(address['lon'], address['lat'])

                # Classify point
                classification = _classify_point(point, polygon_shape)

                # Add to appropriate list
                if classification == 'inside':
                    inside.append(address)
                elif classification == 'boundary':
                    boundary.append(address)
                else:
                    outside.append(address)

            except Exception as e:
                logger.warning(f"Failed to classify address {i}: {e}")
                errors.append({
                    'index': i,
                    'address': address,
                    'error': str(e)
                })

        logger.info(
            f"Classified {len(addresses)} addresses: "
            f"{len(inside)} inside, {len(outside)} outside, "
            f"{len(boundary)} on boundary, {len(errors)} errors"
        )

        # Build result
        result_data = {
            'inside': inside,
            'outside': outside,
            'boundary': boundary,
            'summary': {
                'total': len(addresses),
                'inside_count': len(inside),
                'outside_count': len(outside),
                'boundary_count': len(boundary),
                'error_count': len(errors)
            }
        }

        # Include errors if any
        if errors:
            result_data['errors'] = errors

        return create_success_response(
            result_data,
            metadata={
                'addresses_tested': len(addresses),
                'inside_count': len(inside),
                'outside_count': len(outside),
                'boundary_count': len(boundary)
            }
        )

    except Exception as e:
        logger.error(f"Failed to check addresses against polygon: {e}", exc_info=True)
        return create_error_response(
            f"Failed to check addresses against polygon: {str(e)}",
            ErrorCode.INTERNAL_ERROR
        )


def batch_classify_addresses(
    polygon_geojson: Dict[str, Any],
    address_coords: List[Tuple[float, float]],
    boundary_buffer: float = BOUNDARY_BUFFER_DISTANCE
) -> Dict[str, List[int]]:
    """
    Batch classify address coordinates against a polygon.

    Optimized version for large batches of coordinates.

    Args:
        polygon_geojson: GeoJSON polygon object
        address_coords: List of (longitude, latitude) tuples
        boundary_buffer: Distance threshold for boundary detection

    Returns:
        Dictionary with indices of addresses by classification
    """
    try:
        # Convert polygon to Shapely
        if polygon_geojson.get('type') == 'Feature':
            polygon_shape = shape(polygon_geojson['geometry'])
        else:
            polygon_shape = shape(polygon_geojson)

        inside_indices = []
        outside_indices = []
        boundary_indices = []

        for i, (lon, lat) in enumerate(address_coords):
            point = Point(lon, lat)
            classification = _classify_point(point, polygon_shape, boundary_buffer)

            if classification == 'inside':
                inside_indices.append(i)
            elif classification == 'boundary':
                boundary_indices.append(i)
            else:
                outside_indices.append(i)

        return {
            'inside': inside_indices,
            'outside': outside_indices,
            'boundary': boundary_indices
        }

    except Exception as e:
        logger.error(f"Batch classification failed: {e}")
        return {
            'inside': [],
            'outside': [],
            'boundary': []
        }
