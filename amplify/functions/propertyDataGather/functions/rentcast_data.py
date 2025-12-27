"""Rentcast API data retrieval functions."""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, field_validator
import time
import logging
import requests
from ..common import (
    FunctionResult,
    FunctionMetadata,
    ErrorCode,
    create_error_response,
    create_success_response,
    RentcastClient
)
from ..common.distributed_rate_limiter import (
    acquire_rate_limit,
    RateLimitService
)

logger = logging.getLogger(__name__)


def _enforce_rentcast_rate_limit():
    """
    Enforce Rentcast API rate limit of 20 requests per second.

    Uses distributed rate limiting via DynamoDB to coordinate across
    multiple Lambda invocations. This is proactive rate limiting to
    prevent 429 errors.
    """
    if not acquire_rate_limit(RateLimitService.RENTCAST, timeout=10.0):
        logger.warning("Rentcast rate limit timeout after 10s, proceeding anyway")
    else:
        logger.debug("Rentcast rate limit slot acquired")


# ============================================================================
# PROPERTY RECORDS
# ============================================================================

class RentcastPropertyRecordsInput(BaseModel):
    """Input for Rentcast property records search."""
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius: Optional[float] = None
    property_type: Optional[str] = None
    bedrooms: Optional[str] = None
    bathrooms: Optional[str] = None
    square_footage: Optional[str] = None
    year_built: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None

    @field_validator('zip_code')
    @classmethod
    def validate_zip_code(cls, v):
        """Validate ZIP code is 5 digits."""
        if v is not None and (not v.isdigit() or len(v) != 5):
            raise ValueError("ZIP code must be 5 digits")
        return v

    @field_validator('limit')
    @classmethod
    def validate_limit(cls, v):
        """Validate limit is within acceptable range."""
        if v is not None and (v < 1 or v > 500):
            raise ValueError("Limit must be between 1 and 500")
        return v

    @field_validator('radius')
    @classmethod
    def validate_radius(cls, v):
        """Validate radius is positive."""
        if v is not None and v <= 0:
            raise ValueError("Radius must be positive")
        return v


class RentcastPropertyRecordsOutput(BaseModel):
    """Output for Rentcast property records search."""
    properties: List[Any]
    total_count: int


def get_rentcast_property_records(
    input_data: Dict[str, Any],
    client: RentcastClient
) -> FunctionResult[RentcastPropertyRecordsOutput]:
    """
    Search for property records using Rentcast API.

    Args:
        input_data: Dictionary with search parameters
        client: Initialized RentcastClient

    Returns:
        FunctionResult containing property records or error
    """
    start_time = time.time()

    try:
        # Validate input
        try:
            search_input = RentcastPropertyRecordsInput(**input_data)
        except Exception as e:
            return create_error_response(
                str(e),
                ErrorCode.VALIDATION_ERROR
            )

        # Validate at least one location parameter is provided
        has_location = any([
            search_input.address,
            search_input.city and search_input.state,
            search_input.zip_code,
            search_input.latitude and search_input.longitude
        ])

        if not has_location:
            return create_error_response(
                "At least one location parameter required (address, city/state, zip_code, or latitude/longitude)",
                ErrorCode.VALIDATION_ERROR
            )

        # Build query parameters
        params = {}
        if search_input.address:
            params['address'] = search_input.address
        if search_input.city:
            params['city'] = search_input.city
        if search_input.state:
            params['state'] = search_input.state
        if search_input.zip_code:
            params['zipCode'] = search_input.zip_code
        if search_input.latitude is not None:
            params['latitude'] = search_input.latitude
        if search_input.longitude is not None:
            params['longitude'] = search_input.longitude
        if search_input.radius is not None:
            params['radius'] = search_input.radius
        if search_input.property_type:
            params['propertyType'] = search_input.property_type
        if search_input.bedrooms:
            params['bedrooms'] = search_input.bedrooms
        if search_input.bathrooms:
            params['bathrooms'] = search_input.bathrooms
        if search_input.square_footage:
            params['squareFootage'] = search_input.square_footage
        if search_input.year_built:
            params['yearBuilt'] = search_input.year_built
        if search_input.limit is not None:
            params['limit'] = search_input.limit
        if search_input.offset is not None:
            params['offset'] = search_input.offset

        # Enforce rate limiting before API call
        _enforce_rentcast_rate_limit()

        # Make API request
        try:
            response_data = client.get('/properties', params)
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code
            if status_code == 401:
                return create_error_response(
                    "Invalid or missing Rentcast API key",
                    ErrorCode.CONFIG_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            elif status_code == 404:
                return create_error_response(
                    "No property records found",
                    ErrorCode.NO_DATA,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            elif status_code == 429:
                return create_error_response(
                    "Rentcast rate limit exceeded (20 requests/second)",
                    ErrorCode.RATE_LIMIT_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            else:
                return create_error_response(
                    f"Rentcast API error: {e}",
                    ErrorCode.EXTERNAL_API_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
        except requests.exceptions.Timeout:
            return create_error_response(
                "Rentcast API request timed out",
                ErrorCode.TIMEOUT_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )
        except Exception as e:
            return create_error_response(
                f"Request failed: {e}",
                ErrorCode.INTERNAL_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        # Parse response
        properties = response_data if isinstance(response_data, list) else []

        if not properties:
            return create_error_response(
                "No property records found",
                ErrorCode.NO_DATA,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        # Create output
        output = RentcastPropertyRecordsOutput(
            properties=properties,
            total_count=len(properties)
        )

        return create_success_response(
            data=output.model_dump(),
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time,
                model='rentcast',
                search_domains=['rentcast.io'],
                extra={'result_count': len(properties)}
            )
        )

    except Exception as error:
        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR,
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time
            )
        )


# ============================================================================
# PROPERTY LISTINGS (Shared for Rental and Sale)
# ============================================================================

class RentcastListingsInput(BaseModel):
    """Shared input for Rentcast listings search (rental and sale)."""
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius: Optional[float] = None
    property_type: Optional[str] = None
    bedrooms: Optional[str] = None
    bathrooms: Optional[str] = None
    price: Optional[str] = None
    days_old: Optional[str] = None
    status: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None

    @field_validator('zip_code')
    @classmethod
    def validate_zip_code(cls, v):
        """Validate ZIP code is 5 digits."""
        if v is not None and (not v.isdigit() or len(v) != 5):
            raise ValueError("ZIP code must be 5 digits")
        return v

    @field_validator('limit')
    @classmethod
    def validate_limit(cls, v):
        """Validate limit is within acceptable range."""
        if v is not None and (v < 1 or v > 500):
            raise ValueError("Limit must be between 1 and 500")
        return v

    @field_validator('radius')
    @classmethod
    def validate_radius(cls, v):
        """Validate radius is positive."""
        if v is not None and v <= 0:
            raise ValueError("Radius must be positive")
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        """Validate status is Active or Inactive."""
        if v is not None and v not in ['Active', 'Inactive']:
            raise ValueError("Status must be 'Active' or 'Inactive'")
        return v


class RentcastListingsOutput(BaseModel):
    """Shared output for Rentcast listings search (rental and sale)."""
    listings: List[Any]
    total_count: int


# Backward compatibility aliases
RentcastRentalListingsInput = RentcastListingsInput
RentcastRentalListingsOutput = RentcastListingsOutput
RentcastSaleListingsInput = RentcastListingsInput
RentcastSaleListingsOutput = RentcastListingsOutput


def _get_rentcast_listings(
    input_data: Dict[str, Any],
    client: RentcastClient,
    endpoint: str,
    listing_type: str
) -> FunctionResult[RentcastListingsOutput]:
    """
    Internal helper to search for listings using Rentcast API.

    Args:
        input_data: Dictionary with search parameters
        client: Initialized RentcastClient
        endpoint: API endpoint path (e.g., '/listings/sale' or '/listings/rental/long-term')
        listing_type: Type of listing for error messages ('sale' or 'rental')

    Returns:
        FunctionResult containing listings or error
    """
    start_time = time.time()

    try:
        # Validate input
        try:
            search_input = RentcastListingsInput(**input_data)
        except Exception as e:
            return create_error_response(
                str(e),
                ErrorCode.VALIDATION_ERROR
            )

        # Validate at least one location parameter is provided
        has_location = any([
            search_input.address,
            search_input.city and search_input.state,
            search_input.zip_code,
            search_input.latitude and search_input.longitude
        ])

        if not has_location:
            return create_error_response(
                "At least one location parameter required (address, city/state, zip_code, or latitude/longitude)",
                ErrorCode.VALIDATION_ERROR
            )

        # Build query parameters
        params = {}
        if search_input.address:
            params['address'] = search_input.address
        if search_input.city:
            params['city'] = search_input.city
        if search_input.state:
            params['state'] = search_input.state
        if search_input.zip_code:
            params['zipCode'] = search_input.zip_code
        if search_input.latitude is not None:
            params['latitude'] = search_input.latitude
        if search_input.longitude is not None:
            params['longitude'] = search_input.longitude
        if search_input.radius is not None:
            params['radius'] = search_input.radius
        if search_input.property_type:
            params['propertyType'] = search_input.property_type
        if search_input.bedrooms:
            params['bedrooms'] = search_input.bedrooms
        if search_input.bathrooms:
            params['bathrooms'] = search_input.bathrooms
        if search_input.price:
            params['price'] = search_input.price
        if search_input.days_old:
            params['daysOld'] = search_input.days_old
        if search_input.status:
            params['status'] = search_input.status
        if search_input.limit is not None:
            params['limit'] = search_input.limit
        if search_input.offset is not None:
            params['offset'] = search_input.offset

        # Enforce rate limiting before API call
        _enforce_rentcast_rate_limit()

        # Make API request
        try:
            response_data = client.get(endpoint, params)
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code
            if status_code == 401:
                return create_error_response(
                    "Invalid or missing Rentcast API key",
                    ErrorCode.CONFIG_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            elif status_code == 404:
                return create_error_response(
                    f"No {listing_type} listings found",
                    ErrorCode.NO_DATA,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            elif status_code == 429:
                return create_error_response(
                    "Rentcast rate limit exceeded (20 requests/second)",
                    ErrorCode.RATE_LIMIT_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            else:
                return create_error_response(
                    f"Rentcast API error: {e}",
                    ErrorCode.EXTERNAL_API_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
        except requests.exceptions.Timeout:
            return create_error_response(
                "Rentcast API request timed out",
                ErrorCode.TIMEOUT_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )
        except Exception as e:
            return create_error_response(
                f"Request failed: {e}",
                ErrorCode.INTERNAL_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        # Parse response
        listings = response_data if isinstance(response_data, list) else []

        if not listings:
            return create_error_response(
                f"No {listing_type} listings found",
                ErrorCode.NO_DATA,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        # Create output
        output = RentcastListingsOutput(
            listings=listings,
            total_count=len(listings)
        )

        return create_success_response(
            data=output.model_dump(),
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time,
                model='rentcast',
                search_domains=['rentcast.io'],
                extra={'result_count': len(listings), 'listing_type': listing_type}
            )
        )

    except Exception as error:
        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR,
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time
            )
        )


# ============================================================================
# RENTAL LISTINGS
# ============================================================================

def get_rentcast_rental_listings(
    input_data: Dict[str, Any],
    client: RentcastClient
) -> FunctionResult[RentcastListingsOutput]:
    """
    Search for rental listings using Rentcast API.

    Args:
        input_data: Dictionary with search parameters
        client: Initialized RentcastClient

    Returns:
        FunctionResult containing rental listings or error
    """
    return _get_rentcast_listings(
        input_data,
        client,
        '/listings/rental/long-term',
        'rental'
    )


# ============================================================================
# SALE LISTINGS
# ============================================================================

def get_rentcast_sale_listings(
    input_data: Dict[str, Any],
    client: RentcastClient
) -> FunctionResult[RentcastListingsOutput]:
    """
    Search for sale listings using Rentcast API.

    Args:
        input_data: Dictionary with search parameters
        client: Initialized RentcastClient

    Returns:
        FunctionResult containing sale listings or error
    """
    return _get_rentcast_listings(
        input_data,
        client,
        '/listings/sale',
        'sale'
    )


# ============================================================================
# MARKET STATISTICS
# ============================================================================

class RentcastMarketStatsInput(BaseModel):
    """Input for Rentcast market statistics."""
    zip_code: str
    data_type: Optional[str] = 'All'
    history_range: Optional[int] = 12

    @field_validator('zip_code')
    @classmethod
    def validate_zip_code(cls, v):
        """Validate ZIP code is 5 digits."""
        if not v.isdigit() or len(v) != 5:
            raise ValueError("ZIP code must be 5 digits")
        return v

    @field_validator('data_type')
    @classmethod
    def validate_data_type(cls, v):
        """Validate data type is valid."""
        if v not in ['All', 'Sale', 'Rental']:
            raise ValueError("data_type must be 'All', 'Sale', or 'Rental'")
        return v

    @field_validator('history_range')
    @classmethod
    def validate_history_range(cls, v):
        """Validate history range is positive."""
        if v is not None and v < 1:
            raise ValueError("history_range must be at least 1")
        return v


class RentcastMarketStatsOutput(BaseModel):
    """Output for Rentcast market statistics."""
    zip_code: str
    sale_data: Optional[Dict[str, Any]] = None
    rental_data: Optional[Dict[str, Any]] = None


def get_rentcast_market_stats(
    input_data: Dict[str, Any],
    client: RentcastClient
) -> FunctionResult[RentcastMarketStatsOutput]:
    """
    Get market statistics for a ZIP code using Rentcast API.

    Args:
        input_data: Dictionary with query parameters
        client: Initialized RentcastClient

    Returns:
        FunctionResult containing market statistics or error
    """
    start_time = time.time()

    try:
        # Validate input
        try:
            search_input = RentcastMarketStatsInput(**input_data)
        except Exception as e:
            return create_error_response(
                str(e),
                ErrorCode.VALIDATION_ERROR
            )

        # Build query parameters
        params = {
            'zipCode': search_input.zip_code
        }
        if search_input.data_type:
            params['dataType'] = search_input.data_type
        if search_input.history_range is not None:
            params['historyRange'] = search_input.history_range

        # Enforce rate limiting before API call
        _enforce_rentcast_rate_limit()

        # Make API request
        try:
            response_data = client.get('/markets', params)
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code
            if status_code == 401:
                return create_error_response(
                    "Invalid or missing Rentcast API key",
                    ErrorCode.CONFIG_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            elif status_code == 404:
                return create_error_response(
                    f"No market data found for ZIP code {search_input.zip_code}",
                    ErrorCode.NO_DATA,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            elif status_code == 429:
                return create_error_response(
                    "Rentcast rate limit exceeded (20 requests/second)",
                    ErrorCode.RATE_LIMIT_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
            else:
                return create_error_response(
                    f"Rentcast API error: {e}",
                    ErrorCode.EXTERNAL_API_ERROR,
                    metadata=FunctionMetadata(
                        api_calls=1,
                        execution_time=time.time() - start_time
                    )
                )
        except requests.exceptions.Timeout:
            return create_error_response(
                "Rentcast API request timed out",
                ErrorCode.TIMEOUT_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )
        except Exception as e:
            return create_error_response(
                f"Request failed: {e}",
                ErrorCode.INTERNAL_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        # Parse response
        sale_data = response_data.get('saleData')
        rental_data = response_data.get('rentalData')

        if not sale_data and not rental_data:
            return create_error_response(
                f"No market data available for ZIP code {search_input.zip_code}",
                ErrorCode.NO_DATA,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        # Create output
        output = RentcastMarketStatsOutput(
            zip_code=search_input.zip_code,
            sale_data=sale_data,
            rental_data=rental_data
        )

        return create_success_response(
            data=output.model_dump(),
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time,
                model='rentcast',
                search_domains=['rentcast.io'],
                extra={
                    'has_sale_data': sale_data is not None,
                    'has_rental_data': rental_data is not None
                }
            )
        )

    except Exception as error:
        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR,
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time
            )
        )
