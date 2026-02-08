"""Geocoding functions using Google Address Validation API and AWS Location Service v2."""

from typing import Dict, Any, Optional, List, Tuple
from pydantic import BaseModel
import logging
import requests
import boto3
from concurrent.futures import ThreadPoolExecutor, as_completed

from ..common.types import FunctionResult, ErrorCode
from ..common.utils import (
    validate_input,
    create_error_response,
    create_success_response,
    measure_execution_time
)
from ..common.distributed_rate_limiter import (
    acquire_rate_limit,
    RateLimitService
)
from ..common.aws_clients import get_google_maps_api_key

logger = logging.getLogger(__name__)

# Google Address Validation API configuration
GOOGLE_VALIDATION_URL = "https://addressvalidation.googleapis.com/v1:validateAddress"
REQUEST_TIMEOUT = 30  # seconds

# AWS Location Service v2 (geo-places) client - module-level singleton
_geo_places_client = None


def _get_geo_places_client():
    """Get or create the AWS geo-places client singleton."""
    global _geo_places_client
    if _geo_places_client is None:
        _geo_places_client = boto3.client('geo-places')
    return _geo_places_client


class GeocodingInput(BaseModel):
    """Input for geocoding an address."""
    street: str
    city: str
    state: str
    zip: Optional[str] = None


def _determine_address_type(metadata: Dict[str, Any], usps_data: Dict[str, Any]) -> str:
    """Determine address type from Google Address Validation response.

    Args:
        metadata: result.metadata from Google API response
        usps_data: result.uspsData from Google API response

    Returns:
        Address type: "house", "commercial", "firm", "highrise", or "unknown"
    """
    if metadata.get('residential') is True:
        return 'house'
    if metadata.get('business') is True:
        return 'commercial'
    record_type = usps_data.get('addressRecordType', '')
    if record_type == 'F':
        return 'firm'
    if record_type == 'H':
        return 'highrise'
    if record_type in ('S', 'R'):
        return 'house'  # Street/Rural addresses are likely residential
    return 'unknown'


def _enforce_rate_limit_google():
    """Enforce Google Address Validation rate limit (50 req/sec)."""
    if not acquire_rate_limit(RateLimitService.GOOGLE_ADDRESS_VALIDATION, timeout=30.0):
        logger.warning("Google Address Validation rate limit timeout after 30s, proceeding anyway")
    else:
        logger.debug("Google Address Validation rate limit slot acquired")


def _enforce_rate_limit_aws():
    """Enforce AWS geo-places rate limit (50 req/sec)."""
    if not acquire_rate_limit(RateLimitService.AWS_GEO_PLACES, timeout=30.0):
        logger.warning("AWS geo-places rate limit timeout after 30s, proceeding anyway")
    else:
        logger.debug("AWS geo-places rate limit slot acquired")


@measure_execution_time
def get_coordinates(
    input_data: Dict[str, Any]
) -> FunctionResult[Dict[str, Any]]:
    """
    Validate and geocode an address using Google Address Validation API.

    Returns residential classification, coordinates, USPS data, and county
    in a single API call.

    Args:
        input_data: Dictionary containing street, city, state, and optional zip

    Returns:
        FunctionResult containing geocoding data with lat, lon, type, display_name,
        address dict (with county, postcode, state, city, road), and _google_metadata.

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

        # Build address string for logging
        address_parts = [geo_input.street, geo_input.city, geo_input.state]
        if geo_input.zip:
            address_parts.append(geo_input.zip)
        full_address = ", ".join(part for part in address_parts if part)

        logger.info(f"Geocoding address via Google Address Validation: {full_address}")

        # Get API key
        api_key = get_google_maps_api_key()

        # Enforce rate limiting
        _enforce_rate_limit_google()

        # Build request body
        request_body = {
            'address': {
                'regionCode': 'US',
                'locality': geo_input.city,
                'administrativeArea': geo_input.state,
                'addressLines': [geo_input.street],
            },
            'enableUspsCass': True,
        }
        if geo_input.zip:
            request_body['address']['postalCode'] = geo_input.zip

        # Make HTTP request to Google Address Validation API
        logger.debug(f"Calling Google Address Validation API")
        response = requests.post(
            f"{GOOGLE_VALIDATION_URL}?key={api_key}",
            json=request_body,
            timeout=REQUEST_TIMEOUT
        )

        # Check HTTP status
        response.raise_for_status()

        # Parse JSON response
        json_data = response.json()
        result = json_data.get('result', {})

        # Extract geocode location
        geocode = result.get('geocode', {})
        location = geocode.get('location', {})
        lat = location.get('latitude')
        lon = location.get('longitude')

        if lat is None or lon is None:
            logger.warning(f"No coordinates found for address: {full_address}")
            return create_error_response(
                f"No coordinates found for address: {full_address}",
                ErrorCode.NOT_FOUND
            )

        # Extract metadata and USPS data for type determination
        metadata = result.get('metadata', {})
        usps_data = result.get('uspsData', {})
        verdict = result.get('verdict', {})

        # Determine address type
        address_type = _determine_address_type(metadata, usps_data)

        # Extract formatted address
        address_obj = result.get('address', {})
        formatted_address = address_obj.get('formattedAddress', full_address)

        # Extract county from USPS data
        county = usps_data.get('county', '')

        logger.info(
            f"Successfully geocoded to: {lat}, {lon} (type={address_type})"
        )

        # Build response dict (backward compatible with orchestrator)
        response_data = {
            'lat': str(lat),
            'lon': str(lon),
            'type': address_type,
            'display_name': formatted_address,
            'address': {
                'county': county,
                'postcode': geo_input.zip or '',
                'state': geo_input.state,
                'city': geo_input.city,
                'street': geo_input.street,
            },
            '_google_metadata': {
                'residential': metadata.get('residential'),
                'business': metadata.get('business'),
                'dpv_confirmation': usps_data.get('dpvConfirmation'),
                'address_record_type': usps_data.get('addressRecordType'),
                'address_complete': verdict.get('addressComplete'),
            }
        }

        return create_success_response(
            response_data,
            metadata={
                'source': 'google_address_validation',
                'query': full_address,
                'api_calls': 1,
                'result_count': 1
            }
        )

    except requests.exceptions.Timeout:
        logger.error("Google Address Validation API request timed out")
        return create_error_response(
            f"Geocoding request timed out after {REQUEST_TIMEOUT} seconds",
            ErrorCode.TIMEOUT_ERROR
        )
    except requests.exceptions.HTTPError as e:
        logger.error(f"Google Address Validation API HTTP error: {e}")
        return create_error_response(
            f"Google Address Validation API error: {e}",
            ErrorCode.EXTERNAL_API_ERROR
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error calling Google Address Validation API: {e}")
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
    except Exception as e:
        logger.error(f"Unexpected geocoding error: {str(e)}", exc_info=True)
        return create_error_response(
            f"Failed to geocode address: {str(e)}",
            ErrorCode.EXTERNAL_API_ERROR
        )


def _geocode_single_address_aws(address: Dict[str, Any]) -> FunctionResult[Dict[str, Any]]:
    """
    Geocode a single address using AWS Location Service v2 (geo-places).

    Args:
        address: Dictionary with street, city, state, zip keys

    Returns:
        FunctionResult with lat/lon as strings
    """
    try:
        # Build query text
        parts = [address.get('street', ''), address.get('city', ''), address.get('state', '')]
        zip_code = address.get('zip', '')
        if zip_code:
            parts.append(zip_code)
        query_text = ', '.join(p for p in parts if p)

        if not query_text.strip():
            return create_error_response(
                "Empty address query",
                ErrorCode.VALIDATION_ERROR
            )

        # Enforce rate limiting
        _enforce_rate_limit_aws()

        # Call AWS geo-places
        client = _get_geo_places_client()
        response = client.geocode(
            QueryText=query_text,
            Filter={'IncludeCountries': ['USA']},
            MaxResults=1
        )

        result_items = response.get('ResultItems', [])
        if not result_items:
            return create_error_response(
                f"No results found for address: {query_text}",
                ErrorCode.NOT_FOUND
            )

        # Position is [longitude, latitude] (lon first!)
        position = result_items[0].get('Position', [])
        if len(position) < 2:
            return create_error_response(
                f"Invalid position data for address: {query_text}",
                ErrorCode.DATA_VALIDATION_ERROR
            )

        lon, lat = position[0], position[1]

        return create_success_response(
            {'lat': str(lat), 'lon': str(lon)},
            metadata={
                'source': 'aws_geo_places',
                'query': query_text,
                'api_calls': 1
            }
        )

    except Exception as e:
        logger.error(f"AWS geo-places geocoding error: {str(e)}", exc_info=True)
        return create_error_response(
            f"Failed to geocode address: {str(e)}",
            ErrorCode.EXTERNAL_API_ERROR
        )


def batch_geocode_addresses(
    addresses: List[Dict[str, Any]]
) -> List[FunctionResult[Dict[str, Any]]]:
    """
    Geocode multiple addresses in parallel using AWS Location Service v2 (geo-places).

    Uses ThreadPoolExecutor to parallelize API calls while respecting
    rate limits via distributed rate limiter.

    Args:
        addresses: List of address dictionaries, each with street, city, state, zip

    Returns:
        List of FunctionResult objects in same order as input addresses

    Example:
        >>> addresses = [
        ...     {"street": "2092 W 101st St", "city": "Cleveland", "state": "OH", "zip": "44102"},
        ...     {"street": "2142 W 105th St", "city": "Cleveland", "state": "OH", "zip": "44102"}
        ... ]
        >>> results = batch_geocode_addresses(addresses)
        >>> for i, result in enumerate(results):
        ...     if result.success:
        ...         print(f"Address {i}: {result.data['lat']}, {result.data['lon']}")
    """
    def geocode_with_index(index: int, address: Dict[str, Any]) -> Tuple[int, FunctionResult]:
        """Geocode single address and return with its index to maintain order."""
        try:
            logger.debug(f"Geocoding address {index}: {address.get('street', 'N/A')[:50]}...")
            result = _geocode_single_address_aws(address)
            if result.success:
                logger.debug(f"Address {index} geocoded: lat={result.data.get('lat')}, lon={result.data.get('lon')}")
            else:
                logger.warning(f"Address {index} geocoding failed: {result.error}")
            return (index, result)
        except Exception as e:
            logger.error(f"Exception geocoding address {index}: {e}", exc_info=True)
            error_result = create_error_response(
                f"Failed to geocode address: {str(e)}",
                ErrorCode.INTERNAL_ERROR
            )
            return (index, error_result)

    if not addresses:
        logger.warning("batch_geocode_addresses called with empty address list")
        return []

    logger.info(f"Batch geocoding {len(addresses)} addresses via AWS geo-places")

    # Initialize results list with None placeholders
    results: List[Optional[FunctionResult]] = [None] * len(addresses)

    # Use ThreadPoolExecutor for parallel requests
    max_workers = min(len(addresses), 10)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all geocoding tasks
        futures = {
            executor.submit(geocode_with_index, i, addr): i
            for i, addr in enumerate(addresses)
        }

        # Collect results as they complete
        for future in as_completed(futures):
            try:
                index, result = future.result()
                results[index] = result
            except Exception as e:
                logger.error(f"Unexpected error in batch geocoding future: {e}", exc_info=True)
                original_index = futures[future]
                results[original_index] = create_error_response(
                    f"Unexpected error: {str(e)}",
                    ErrorCode.INTERNAL_ERROR
                )

    logger.info(f"Batch geocoding completed for {len(addresses)} addresses")

    return results
