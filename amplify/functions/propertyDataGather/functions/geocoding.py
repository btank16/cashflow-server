"""Geocoding function using OpenStreetMap Nominatim API via direct HTTP requests."""

from typing import Dict, Any, Optional
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

logger = logging.getLogger(__name__)

# Nominatim API configuration
NOMINATIM_API_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "CashflowTotal/1.0 (support@cashflow.deal)"
REQUEST_TIMEOUT = 10  # seconds
RATE_LIMIT_DELAY = 1.0  # seconds between requests (Nominatim usage policy)


class GeocodingInput(BaseModel):
    """Input for geocoding an address."""
    street: str
    city: str
    state: str
    zip: Optional[str] = None


class ZipBoundingBoxInput(BaseModel):
    """Input for getting zip code bounding box."""
    zip: str
    country: str = "us"  # Default to US


# Track last request time for rate limiting
_last_request_time = 0.0


def _enforce_rate_limit():
    """
    Enforce Nominatim's rate limit of 1 request per second.

    Nominatim usage policy requires maximum 1 request per second.
    This function ensures compliance by adding delays if needed.
    """
    global _last_request_time

    current_time = time.time()
    time_since_last_request = current_time - _last_request_time

    if time_since_last_request < RATE_LIMIT_DELAY:
        sleep_time = RATE_LIMIT_DELAY - time_since_last_request
        logger.debug(f"Rate limiting: sleeping for {sleep_time:.2f} seconds")
        time.sleep(sleep_time)

    _last_request_time = time.time()


@measure_execution_time
def get_coordinates(
    input_data: Dict[str, Any]
) -> FunctionResult[Dict[str, Any]]:
    """
    Convert address to coordinates using OpenStreetMap Nominatim API via direct HTTP requests.

    This function complies with Nominatim's usage policy:
    - Custom User-Agent header (required)
    - 1 request per second rate limiting (enforced)
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

        # Enforce rate limiting (1 req/sec as per Nominatim usage policy)
        _enforce_rate_limit()

        # Prepare request parameters
        params = {
            'q': full_address,
            'format': 'json',
            'addressdetails': 1,  # Include structured address details
            'limit': 1,  # Only return top result
            'countrycodes': 'us'  # Limit to US results for better accuracy
        }

        # Prepare headers (User-Agent is REQUIRED by Nominatim)
        headers = {
            'User-Agent': USER_AGENT
        }

        # Make HTTP request to Nominatim API
        logger.debug(f"Calling Nominatim API: {NOMINATIM_API_URL}")
        response = requests.get(
            NOMINATIM_API_URL,
            params=params,
            headers=headers,
            timeout=REQUEST_TIMEOUT
        )

        # Check HTTP status
        response.raise_for_status()

        # Parse JSON response
        json_data = response.json()

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

    except requests.exceptions.Timeout:
        logger.error("Nominatim API request timed out")
        return create_error_response(
            f"Geocoding request timed out after {REQUEST_TIMEOUT} seconds",
            ErrorCode.TIMEOUT_ERROR
        )
    except requests.exceptions.HTTPError as e:
        logger.error(f"Nominatim API HTTP error: {e}")
        return create_error_response(
            f"Nominatim API error: {e}",
            ErrorCode.EXTERNAL_API_ERROR
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error calling Nominatim API: {e}")
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
        logger.error(f"Missing expected field in Nominatim response: {e}")
        return create_error_response(
            f"Invalid response from Nominatim API: missing field {e}",
            ErrorCode.DATA_VALIDATION_ERROR
        )
    except Exception as e:
        logger.error(f"Unexpected geocoding error: {str(e)}", exc_info=True)
        return create_error_response(
            f"Failed to geocode address: {str(e)}",
            ErrorCode.EXTERNAL_API_ERROR
        )


@measure_execution_time
def get_zip_bounding_box(
    input_data: Dict[str, Any]
) -> FunctionResult[Dict[str, Any]]:
    """
    Get bounding box coordinates for a zip code using OpenStreetMap Nominatim API.

    This function complies with Nominatim's usage policy:
    - Custom User-Agent header (required)
    - 1 request per second rate limiting (enforced)
    - Results should be cached by calling application

    Args:
        input_data: Dictionary containing zip code and optional country

    Returns:
        FunctionResult containing raw Nominatim JSON response with bounding box data

    The raw JSON response includes:
        - boundingbox: Array of [min_lat, max_lat, min_lon, max_lon] as strings
        - lat: Center latitude as string
        - lon: Center longitude as string
        - display_name: Full formatted location name
        - place_id: Nominatim place identifier
        - osm_type: OSM element type
        - osm_id: OSM element ID

    Example:
        >>> input_data = {"zip": "44102", "country": "us"}
        >>> result = get_zip_bounding_box(input_data)
        >>> if result.success:
        ...     bbox = result.data['boundingbox']
        ...     min_lat, max_lat, min_lon, max_lon = bbox
        ...     center_lat = result.data['lat']
        ...     center_lon = result.data['lon']
    """
    # Validate input
    validation = validate_input(input_data, ['zip'])
    if not validation['is_valid']:
        return create_error_response(
            f"Missing required fields: {validation['missing_fields']}",
            ErrorCode.VALIDATION_ERROR
        )

    try:
        # Parse and validate input with Pydantic
        zip_input = ZipBoundingBoxInput(**input_data)

        logger.info(f"Getting bounding box for zip code: {zip_input.zip} ({zip_input.country})")

        # Enforce rate limiting (1 req/sec as per Nominatim usage policy)
        _enforce_rate_limit()

        # Prepare request parameters
        params = {
            'postalcode': zip_input.zip,
            'country': zip_input.country,
            'format': 'json',
            'addressdetails': 1,  # Include structured address details
            'limit': 1  # Only return top result
        }

        # Prepare headers (User-Agent is REQUIRED by Nominatim)
        headers = {
            'User-Agent': USER_AGENT
        }

        # Make HTTP request to Nominatim API
        logger.debug(f"Calling Nominatim API: {NOMINATIM_API_URL}")
        response = requests.get(
            NOMINATIM_API_URL,
            params=params,
            headers=headers,
            timeout=REQUEST_TIMEOUT
        )

        # Check HTTP status
        response.raise_for_status()

        # Parse JSON response
        json_data = response.json()

        if not json_data or len(json_data) == 0:
            logger.warning(f"No results found for zip code: {zip_input.zip}")
            return create_error_response(
                f"No results found for zip code: {zip_input.zip}",
                ErrorCode.NOT_FOUND
            )

        # Use first result
        bbox_data = json_data[0]

        # Verify bounding box exists in response
        if 'boundingbox' not in bbox_data:
            logger.error(f"No bounding box in Nominatim response for zip: {zip_input.zip}")
            return create_error_response(
                "Nominatim response missing bounding box data",
                ErrorCode.DATA_VALIDATION_ERROR
            )

        logger.info(
            f"Successfully retrieved bounding box: {bbox_data['boundingbox']}"
        )

        # Return raw Nominatim JSON data
        return create_success_response(
            bbox_data,
            metadata={
                'source': 'nominatim',
                'query_type': 'postal_code',
                'zip': zip_input.zip,
                'country': zip_input.country,
                'api_calls': 1,
                'result_count': len(json_data)
            }
        )

    except requests.exceptions.Timeout:
        logger.error("Nominatim API request timed out")
        return create_error_response(
            f"Request timed out after {REQUEST_TIMEOUT} seconds",
            ErrorCode.TIMEOUT_ERROR
        )
    except requests.exceptions.HTTPError as e:
        logger.error(f"Nominatim API HTTP error: {e}")
        return create_error_response(
            f"Nominatim API error: {e}",
            ErrorCode.EXTERNAL_API_ERROR
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error calling Nominatim API: {e}")
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
        logger.error(f"Missing expected field in Nominatim response: {e}")
        return create_error_response(
            f"Invalid response from Nominatim API: missing field {e}",
            ErrorCode.DATA_VALIDATION_ERROR
        )
    except Exception as e:
        logger.error(f"Unexpected error getting zip bounding box: {str(e)}", exc_info=True)
        return create_error_response(
            f"Failed to get bounding box for zip code: {str(e)}",
            ErrorCode.EXTERNAL_API_ERROR
        )
