"""Geocoding function using OpenStreetMap Nominatim via OSMPythonTools."""

from typing import Dict, Any, Optional
from pydantic import BaseModel
import logging
from OSMPythonTools.nominatim import Nominatim

from ..common.types import FunctionResult, ErrorCode
from ..common.utils import (
    validate_input,
    create_error_response,
    create_success_response,
    measure_execution_time
)

logger = logging.getLogger(__name__)


class GeocodingInput(BaseModel):
    """Input for geocoding an address."""
    street: str
    city: str
    state: str
    zip: Optional[str] = None


# Global Nominatim instance with rate limiting (singleton pattern)
_nominatim = None


def get_nominatim():
    """
    Get or create the Nominatim instance with rate limiting.

    Uses singleton pattern to ensure consistent rate limiting across all requests.
    OSMPythonTools enforces rate limiting via the waitBetweenQueries parameter.

    Returns:
        Nominatim instance
    """
    global _nominatim

    if _nominatim is None:
        # Initialize with rate limiting (1 second between queries)
        # OSMPythonTools handles User-Agent and other headers internally
        _nominatim = Nominatim(waitBetweenQueries=1.0)

    return _nominatim


@measure_execution_time
def get_coordinates(
    input_data: Dict[str, Any]
) -> FunctionResult[Dict[str, Any]]:
    """
    Convert address to coordinates using OpenStreetMap Nominatim via OSMPythonTools.

    This function complies with Nominatim's usage policy:
    - User-Agent header (handled by OSMPythonTools)
    - 1 request per second rate limiting (waitBetweenQueries parameter)
    - Results should be cached by calling application

    Args:
        input_data: Dictionary containing street, city, state, and optional zip

    Returns:
        FunctionResult containing raw Nominatim JSON response with all geocoding data

    The raw JSON response includes:
        - lat: Latitude as string
        - lon: Longitude as string
        - display_name: Full formatted address
        - address: Dictionary with structured address components including:
            - house_number, road, neighbourhood, suburb, city, county, state, postcode, country, country_code
        - place_id: Nominatim place identifier
        - osm_type: OSM element type (node, way, relation)
        - osm_id: OSM element ID
        - boundingbox: Geographic bounding box

    Example:
        >>> input_data = {
        ...     "street": "2179 West 106th Street",
        ...     "city": "Cleveland",
        ...     "state": "OH",
        ...     "zip": "44102"
        ... }
        >>> result = get_coordinates(input_data)
        >>> if result.success:
        ...     lat = result.data['lat']
        ...     lon = result.data['lon']
        ...     county = result.data['address']['county']
        ...     zip_code = result.data['address']['postcode']
    """
    # Validate input
    validation = validate_input(input_data, ['street', 'city', 'state'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    try:
        # Parse and validate input with Pydantic
        geo_input = GeocodingInput(**input_data)

        # Build address query
        address_parts = [geo_input.street, geo_input.city, geo_input.state]
        if geo_input.zip:
            address_parts.append(geo_input.zip)

        # Add USA to improve accuracy for US addresses
        address_parts.append("USA")
        full_address = ", ".join(address_parts)

        logger.info(f"Geocoding address: {full_address}")

        # Get Nominatim instance with rate limiting
        nominatim = get_nominatim()

        # Perform geocoding query
        # Rate limiting is handled automatically by OSMPythonTools (1 req/sec)
        result = nominatim.query(full_address)

        # Get raw JSON response
        json_data = result.toJSON()

        if not json_data or len(json_data) == 0:
            logger.warning(f"No results found for address: {full_address}")
            return create_error_response(
                f"No results found for address: {full_address}",
                ErrorCode.NOT_FOUND
            )

        # Use first result
        geocode_data = json_data[0]

        logger.info(
            f"Successfully geocoded to: {geocode_data.get('lat')}, {geocode_data.get('lon')}"
        )

        # Return raw Nominatim JSON data
        return create_success_response(
            geocode_data,
            metadata={
                'source': 'nominatim',
                'query': full_address,
                'api_calls': 1,
                'result_count': len(json_data)
            }
        )

    except ValueError as e:
        logger.error(f"Invalid input data: {str(e)}")
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )
    except AttributeError as e:
        logger.error(f"Error accessing geocoding result: {str(e)}")
        return create_error_response(
            f"Failed to parse geocoding response: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR
        )
    except Exception as e:
        logger.error(f"Unexpected geocoding error: {str(e)}", exc_info=True)
        return create_error_response(
            f"Failed to geocode address: {str(e)}",
            ErrorCode.EXTERNAL_API_ERROR
        )
