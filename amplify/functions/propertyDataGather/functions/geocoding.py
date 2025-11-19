"""Geocoding function using OpenStreetMap Nominatim via GeoPy."""

from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
import logging
from geopy.geocoders import Nominatim
from geopy.extra.rate_limiter import RateLimiter
from geopy.exc import GeocoderTimedOut, GeocoderUnavailable

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


class GeocodingOutput(BaseModel):
    """Output with coordinates and metadata."""
    latitude: float
    longitude: float
    display_name: str
    address_details: Optional[Dict[str, Any]] = None


# Global geocoder instance with rate limiting (singleton pattern)
_geocoder = None
_rate_limited_geocode = None


def get_geocoder():
    """
    Get or create the geocoder instance with rate limiting.

    Uses singleton pattern to ensure consistent rate limiting across all requests.
    GeoPy's RateLimiter automatically enforces Nominatim's 1 request/second policy.

    Returns:
        Rate-limited geocode function
    """
    global _geocoder, _rate_limited_geocode

    if _geocoder is None:
        # Initialize with custom user agent (REQUIRED by Nominatim usage policy)
        _geocoder = Nominatim(
            user_agent="CashflowTotal/1.0 (support@cashflow.deal)",
            timeout=10
        )

        # Wrap with RateLimiter - automatically enforces 1 req/sec
        _rate_limited_geocode = RateLimiter(
            _geocoder.geocode,
            min_delay_seconds=1.0,  # Enforces minimum 1 second between requests
            max_retries=2,
            error_wait_seconds=5.0
        )

    return _rate_limited_geocode


@measure_execution_time
def get_coordinates(
    input_data: Dict[str, Any]
) -> FunctionResult[GeocodingOutput]:
    """
    Convert address to latitude/longitude using OpenStreetMap Nominatim via GeoPy.

    This function complies with Nominatim's usage policy:
    - Custom User-Agent header
    - 1 request per second rate limiting (handled by GeoPy's RateLimiter)
    - Results should be cached by calling application

    Args:
        input_data: Dictionary containing street, city, state, and optional zip

    Returns:
        FunctionResult containing GeocodingOutput with coordinates or error

    Example:
        >>> input_data = {
        ...     "street": "1600 Amphitheatre Parkway",
        ...     "city": "Mountain View",
        ...     "state": "CA",
        ...     "zip": "94043"
        ... }
        >>> result = get_coordinates(input_data)
        >>> if result.success:
        ...     print(f"Lat: {result.data['latitude']}, Lon: {result.data['longitude']}")
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

        # Get rate-limited geocoder
        geocode = get_geocoder()

        # Perform geocoding with address details
        # Rate limiting is handled automatically by GeoPy's RateLimiter
        location = geocode(
            full_address,
            addressdetails=True,   # Include structured address in response
            language='en',         # English results
            country_codes='us'     # Limit to US results for better accuracy (correct parameter name)
        )

        if not location:
            logger.warning(f"No results found for address: {full_address}")
            return create_error_response(
                f"No results found for address: {full_address}",
                ErrorCode.NOT_FOUND
            )

        # Build output
        output = GeocodingOutput(
            latitude=location.latitude,
            longitude=location.longitude,
            display_name=location.address,
            address_details=location.raw.get('address', {})
        )

        logger.info(
            f"Successfully geocoded to: {location.latitude}, {location.longitude}"
        )

        return create_success_response(
            output.model_dump(),
            metadata={
                'source': 'nominatim',
                'query': full_address,
                'place_id': location.raw.get('place_id'),
                'osm_type': location.raw.get('osm_type'),
                'osm_id': location.raw.get('osm_id')
            }
        )

    except GeocoderTimedOut:
        logger.error("Geocoding request timed out")
        return create_error_response(
            "Geocoding request timed out. Please try again.",
            ErrorCode.TIMEOUT_ERROR
        )
    except GeocoderUnavailable as e:
        logger.error(f"Geocoding service unavailable: {str(e)}")
        return create_error_response(
            f"Geocoding service unavailable: {str(e)}",
            ErrorCode.EXTERNAL_API_ERROR
        )
    except ValueError as e:
        logger.error(f"Invalid input data: {str(e)}")
        return create_error_response(
            f"Invalid input format: {str(e)}",
            ErrorCode.VALIDATION_ERROR
        )
    except Exception as e:
        logger.error(f"Unexpected geocoding error: {str(e)}")
        return create_error_response(
            f"Failed to geocode address: {str(e)}",
            ErrorCode.DATA_VALIDATION_ERROR
        )
