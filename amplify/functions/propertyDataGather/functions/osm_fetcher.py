"""OSM data fetching using Overpass API for boundary detection."""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging
import requests
import time

from ..common.types import FunctionResult, ErrorCode
from ..common.utils import (
    validate_input,
    create_error_response,
    create_success_response,
    measure_execution_time
)
from ..common.osm_config import (
    OSM_WAY_TYPES,
    OVERPASS_API_URL,
    OVERPASS_TIMEOUT,
    OVERPASS_RATE_LIMIT_DELAY,
    build_overpass_query
)

logger = logging.getLogger(__name__)

# Track last request time for rate limiting
_last_overpass_request_time = 0.0


class OSMFetchInput(BaseModel):
    """Input for OSM data fetching."""
    bbox: List[float]  # [min_lat, max_lat, min_lon, max_lon]
    way_types: Optional[Dict[str, List[str]]] = None  # Uses OSM_WAY_TYPES if None


def _enforce_overpass_rate_limit():
    """
    Enforce Overpass API rate limit.

    Overpass has no official rate limit but conservative 2-second delay is recommended.
    """
    global _last_overpass_request_time

    current_time = time.time()
    time_since_last_request = current_time - _last_overpass_request_time

    if time_since_last_request < OVERPASS_RATE_LIMIT_DELAY:
        sleep_time = OVERPASS_RATE_LIMIT_DELAY - time_since_last_request
        logger.debug(f"Overpass rate limiting: sleeping for {sleep_time:.2f} seconds")
        time.sleep(sleep_time)

    _last_overpass_request_time = time.time()


def _parse_osm_ways(overpass_response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse Overpass API response into structured way data.

    Args:
        overpass_response: Raw JSON response from Overpass API

    Returns:
        Dictionary with:
        - ways: List of way objects with nodes and metadata
        - stats: Count by way type
    """
    elements = overpass_response.get('elements', [])
    ways = []
    stats = {
        'highways': 0,
        'railways': 0,
        'waterways': 0,
        'total': 0
    }

    for element in elements:
        if element.get('type') != 'way':
            continue

        # Extract way metadata
        tags = element.get('tags', {})
        geometry = element.get('geometry', [])

        if not geometry:
            logger.warning(f"Way {element.get('id')} has no geometry, skipping")
            continue

        # Determine way category
        way_category = None
        way_type = None

        if 'highway' in tags:
            way_category = 'highway'
            way_type = tags['highway']
            stats['highways'] += 1
        elif 'railway' in tags:
            way_category = 'railway'
            way_type = tags['railway']
            stats['railways'] += 1
        elif 'waterway' in tags:
            way_category = 'waterway'
            way_type = tags['waterway']
            stats['waterways'] += 1
        else:
            continue  # Skip if not a recognized type

        # Extract nodes (coordinates)
        nodes = [
            {'lat': node['lat'], 'lon': node['lon']}
            for node in geometry
        ]

        way_obj = {
            'id': element.get('id'),
            'category': way_category,
            'type': way_type,
            'name': tags.get('name', f'Unnamed {way_type}'),
            'nodes': nodes,
            'tags': tags
        }

        ways.append(way_obj)
        stats['total'] += 1

    return {
        'ways': ways,
        'stats': stats
    }


@measure_execution_time
def fetch_osm_ways(
    input_data: Dict[str, Any]
) -> FunctionResult[Dict[str, Any]]:
    """
    Fetch OSM ways from Overpass API within a bounding box.

    Args:
        input_data: Dictionary containing:
            - bbox: [min_lat, max_lat, min_lon, max_lon]
            - way_types: Optional dict of way types (uses OSM_WAY_TYPES if not provided)

    Returns:
        FunctionResult containing:
        - ways: List of way objects with nodes and metadata
        - stats: Count by way type
        - bbox_used: The bounding box queried
        - query: The Overpass QL query used

    Example:
        >>> input_data = {
        ...     "bbox": [41.47, 41.53, -81.85, -81.75]
        ... }
        >>> result = fetch_osm_ways(input_data)
        >>> if result.success:
        ...     ways = result.data['ways']
        ...     stats = result.data['stats']
    """
    # Validate input
    validation = validate_input(input_data, ['bbox'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    try:
        # Parse and validate input with Pydantic
        osm_input = OSMFetchInput(**input_data)

        # Validate bbox format
        if len(osm_input.bbox) != 4:
            return create_error_response(
                "Bounding box must have exactly 4 values: [min_lat, max_lat, min_lon, max_lon]",
                ErrorCode.VALIDATION_ERROR
            )

        min_lat, max_lat, min_lon, max_lon = osm_input.bbox

        # Validate bbox values
        if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
            return create_error_response(
                "Latitude values must be between -90 and 90",
                ErrorCode.VALIDATION_ERROR
            )

        if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180):
            return create_error_response(
                "Longitude values must be between -180 and 180",
                ErrorCode.VALIDATION_ERROR
            )

        if min_lat >= max_lat or min_lon >= max_lon:
            return create_error_response(
                "Invalid bounding box: min values must be less than max values",
                ErrorCode.VALIDATION_ERROR
            )

        logger.info(f"Fetching OSM ways for bbox: {osm_input.bbox}")

        # Build Overpass query
        query = build_overpass_query(osm_input.bbox, osm_input.way_types)
        logger.debug(f"Overpass query: {query}")

        # Enforce rate limiting
        _enforce_overpass_rate_limit()

        # Make HTTP request to Overpass API
        logger.debug(f"Calling Overpass API: {OVERPASS_API_URL}")
        response = requests.post(
            OVERPASS_API_URL,
            data=query,
            timeout=OVERPASS_TIMEOUT
        )

        # Check HTTP status
        response.raise_for_status()

        # Parse JSON response
        overpass_data = response.json()

        # Check for Overpass API errors
        if 'remark' in overpass_data:
            logger.warning(f"Overpass API remark: {overpass_data['remark']}")

        # Parse ways from response
        parsed_data = _parse_osm_ways(overpass_data)

        logger.info(
            f"Successfully fetched {parsed_data['stats']['total']} OSM ways "
            f"(highways: {parsed_data['stats']['highways']}, "
            f"railways: {parsed_data['stats']['railways']}, "
            f"waterways: {parsed_data['stats']['waterways']})"
        )

        # Return structured data
        return create_success_response(
            {
                'ways': parsed_data['ways'],
                'stats': parsed_data['stats'],
                'bbox_used': osm_input.bbox,
                'query': query
            },
            metadata={
                'source': 'overpass',
                'api_calls': 1,
                'ways_count': parsed_data['stats']['total']
            }
        )

    except requests.exceptions.Timeout:
        logger.error("Overpass API request timed out")
        return create_error_response(
            f"Overpass API request timed out after {OVERPASS_TIMEOUT} seconds",
            ErrorCode.TIMEOUT_ERROR
        )
    except requests.exceptions.HTTPError as e:
        logger.error(f"Overpass API HTTP error: {e}")
        return create_error_response(
            f"Overpass API error: {e}",
            ErrorCode.EXTERNAL_API_ERROR
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error calling Overpass API: {e}")
        return create_error_response(
            f"Network error: {e}",
            ErrorCode.EXTERNAL_API_ERROR
        )
    except ValueError as e:
        logger.error(f"Invalid input data: {str(e)}")
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )
    except KeyError as e:
        logger.error(f"Missing expected field in Overpass response: {e}")
        return create_error_response(
            f"Invalid response from Overpass API: missing field {e}",
            ErrorCode.DATA_VALIDATION_ERROR
        )
    except Exception as e:
        logger.error(f"Unexpected error fetching OSM data: {str(e)}", exc_info=True)
        return create_error_response(
            f"Failed to fetch OSM data: {str(e)}",
            ErrorCode.EXTERNAL_API_ERROR
        )
