"""Zillow ZIP search function using Apify."""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, validator
from apify_client import ApifyClient
import statistics
import time
import logging
from datetime import datetime
from ..common import (
    FunctionResult,
    FunctionMetadata,
    ErrorCode,
    create_error_response,
    create_success_response,
    retry_with_backoff
)
from ..config import APIFY_ACTOR_ID, APIFY_DEFAULT_TIMEOUT, APIFY_DEFAULT_MAX_ITEMS

logger = logging.getLogger(__name__)

# Valid days on Zillow options
VALID_DAYS_ON_ZILLOW = ['1', '7', '14', '30', '90', '6m', '12m', '24m', '36m']


class ZillowZipSearchInput(BaseModel):
    """Input for Zillow ZIP search."""
    zip_codes: List[str]
    price_min: Optional[int] = None
    price_max: Optional[int] = None
    days_on_zillow: Optional[str] = None
    for_sale_by_agent: bool = True
    for_sale_by_owner: bool = False
    for_rent: bool = False
    sold: bool = False
    max_items: Optional[int] = APIFY_DEFAULT_MAX_ITEMS

    @validator('zip_codes')
    def validate_zip_codes(cls, v):
        """Validate ZIP codes are 5 digits."""
        if not v or len(v) == 0:
            raise ValueError("zip_codes must be a non-empty array")

        invalid_zips = [zip_code for zip_code in v if not (zip_code.isdigit() and len(zip_code) == 5)]
        if invalid_zips:
            raise ValueError(f"Invalid ZIP code format: {', '.join(invalid_zips)}. ZIP codes must be 5 digits.")
        return v

    @validator('price_max')
    def validate_price_range(cls, v, values):
        """Validate price range is logical."""
        if v is not None and 'price_min' in values and values['price_min'] is not None:
            if values['price_min'] > v:
                raise ValueError("price_min cannot be greater than price_max")
        return v

    @validator('days_on_zillow')
    def validate_days_on_zillow(cls, v):
        """Validate days on Zillow is a valid option."""
        if v is not None and v not in VALID_DAYS_ON_ZILLOW:
            raise ValueError(f"Invalid daysOnZillow value. Must be one of: {', '.join(VALID_DAYS_ON_ZILLOW)}")
        return v

    @validator('for_sale_by_agent')
    def validate_property_types(cls, v, values):
        """Validate at least one property type is selected."""
        # This runs after all fields, so check all
        if 'for_sale_by_owner' in values and 'for_rent' in values and 'sold' in values:
            all_false = (not v and not values['for_sale_by_owner'] and
                        not values['for_rent'] and not values['sold'])
            if all_false:
                raise ValueError("At least one property type must be enabled")
        return v

    @validator('max_items')
    def validate_max_items(cls, v):
        """Validate max items is positive."""
        if v is not None and v <= 0:
            raise ValueError("max_items must be a positive integer")
        return v


class ZillowPropertyInfo(BaseModel):
    """Information about a single Zillow property."""
    address: str = 'N/A'
    price: float = 0
    price_per_sqft: Optional[float] = None
    price_per_bedroom: Optional[float] = None
    bedrooms: int = 0
    bathrooms: float = 0
    living_area: Optional[int] = None
    zipcode: str = ''
    city: str = ''
    state: str = ''
    home_status: str = ''
    days_on_zillow: int = 0
    zestimate: Optional[float] = None
    rent_zestimate: Optional[float] = None


class ZillowPropertyStatistics(BaseModel):
    """Statistics for a group of properties."""
    count: int = 0
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    median_price: float = 0
    avg_price: float = 0
    avg_price_per_sqft: Optional[float] = None
    avg_price_per_bedroom: Optional[float] = None


class ZillowHomeTypeStats(BaseModel):
    """Property data and statistics for a specific home type."""
    properties: List[ZillowPropertyInfo]
    statistics: ZillowPropertyStatistics


class ProcessedZillowData(BaseModel):
    """Processed and organized Zillow data."""
    by_home_type: Dict[str, ZillowHomeTypeStats]
    summary: Dict[str, Any]


class ZillowZipSearchOutput(BaseModel):
    """Output for Zillow ZIP search."""
    properties: List[Any]  # Raw property data
    processed_data: ProcessedZillowData
    total_count: int
    run_id: str
    dataset_id: str


def process_zillow_properties(raw_properties: List[Dict[str, Any]]) -> ProcessedZillowData:
    """
    Process raw Zillow property data into organized structure by homeType.

    Args:
        raw_properties: Array of raw property data from Zillow

    Returns:
        Processed and organized data
    """
    by_home_type: Dict[str, ZillowHomeTypeStats] = {}
    all_prices: List[float] = []
    home_types = set()

    # First pass: organize properties by homeType
    for item in raw_properties:
        hdp_data = item.get('hdpData')
        if not hdp_data:
            continue

        home_info = hdp_data.get('homeInfo')
        if not home_info:
            continue

        home_type = home_info.get('homeType', 'UNKNOWN')
        home_types.add(home_type)

        # Extract and calculate property information
        price = home_info.get('price', 0)
        living_area = home_info.get('livingArea')
        bedrooms = home_info.get('bedrooms', 0)

        property_info = ZillowPropertyInfo(
            address=home_info.get('streetAddress', 'N/A'),
            price=price,
            price_per_sqft=round(price / living_area) if (price and living_area) else None,
            price_per_bedroom=round(price / bedrooms) if (price and bedrooms > 0) else None,
            bedrooms=bedrooms,
            bathrooms=home_info.get('bathrooms', 0),
            living_area=living_area,
            zipcode=home_info.get('zipcode', ''),
            city=home_info.get('city', ''),
            state=home_info.get('state', ''),
            home_status=home_info.get('homeStatus', ''),
            days_on_zillow=home_info.get('daysOnZillow', 0),
            zestimate=home_info.get('zestimate'),
            rent_zestimate=home_info.get('rentZestimate')
        )

        # Initialize homeType group if needed
        if home_type not in by_home_type:
            by_home_type[home_type] = ZillowHomeTypeStats(
                properties=[],
                statistics=ZillowPropertyStatistics()
            )

        # Add property to its homeType group
        by_home_type[home_type].properties.append(property_info)

        if price:
            all_prices.append(price)

    # Second pass: calculate statistics for each homeType
    for home_type, group in by_home_type.items():
        prices = sorted([p.price for p in group.properties if p.price > 0])

        if prices:
            # Basic price statistics
            group.statistics.count = len(group.properties)
            group.statistics.min_price = min(prices)
            group.statistics.max_price = max(prices)
            group.statistics.avg_price = round(sum(prices) / len(prices))

            # Calculate median
            mid = len(prices) // 2
            if len(prices) % 2 == 0:
                group.statistics.median_price = round((prices[mid - 1] + prices[mid]) / 2)
            else:
                group.statistics.median_price = prices[mid]

            # Calculate average price per sq ft
            prices_per_sqft = [p.price_per_sqft for p in group.properties if p.price_per_sqft is not None]
            if prices_per_sqft:
                group.statistics.avg_price_per_sqft = round(sum(prices_per_sqft) / len(prices_per_sqft))

            # Calculate average price per bedroom
            prices_per_bedroom = [p.price_per_bedroom for p in group.properties if p.price_per_bedroom is not None]
            if prices_per_bedroom:
                group.statistics.avg_price_per_bedroom = round(sum(prices_per_bedroom) / len(prices_per_bedroom))

    # Calculate overall summary
    valid_prices = [p for p in all_prices if p > 0]
    summary = {
        'total_properties': len(raw_properties),
        'home_types': sorted(list(home_types)),
        'price_range': {
            'min': min(valid_prices) if valid_prices else 0,
            'max': max(valid_prices) if valid_prices else 0
        },
        'date_processed': datetime.now().isoformat()
    }

    return ProcessedZillowData(
        by_home_type=by_home_type,
        summary=summary
    )


@retry_with_backoff(max_attempts=3, initial_delay=2.0)
def search_zillow_by_zip(
    input_data: Dict[str, Any],
    apify_client: ApifyClient
) -> FunctionResult[ZillowZipSearchOutput]:
    """
    Search for properties in specified ZIP codes using Zillow via Apify.

    Args:
        input_data: Dictionary with search parameters
        apify_client: Initialized Apify client

    Returns:
        FunctionResult containing property listings or error
    """
    start_time = time.time()

    try:
        # Validate and parse input
        try:
            search_input = ZillowZipSearchInput(**input_data)
        except Exception as e:
            return create_error_response(
                str(e),
                ErrorCode.VALIDATION_ERROR
            )

        # Build the actor input
        actor_input = {
            'zipCodes': search_input.zip_codes
        }

        # Add optional filters if provided
        if search_input.price_min is not None:
            actor_input['priceMin'] = search_input.price_min
        if search_input.price_max is not None:
            actor_input['priceMax'] = search_input.price_max
        if search_input.days_on_zillow:
            actor_input['daysOnZillow'] = search_input.days_on_zillow
        if search_input.for_sale_by_agent is not None:
            actor_input['forSaleByAgent'] = search_input.for_sale_by_agent
        if search_input.for_sale_by_owner is not None:
            actor_input['forSaleByOwner'] = search_input.for_sale_by_owner
        if search_input.for_rent is not None:
            actor_input['forRent'] = search_input.for_rent
        if search_input.sold is not None:
            actor_input['sold'] = search_input.sold

        # Run the actor
        logger.info(f"Running Apify actor {APIFY_ACTOR_ID} with input: {actor_input}")

        run = apify_client.actor(APIFY_ACTOR_ID).call(
            run_input=actor_input,
            timeout_secs=APIFY_DEFAULT_TIMEOUT
        )

        # Check if the run was successful
        if not run or run.get('status') != 'SUCCEEDED':
            return create_error_response(
                f"Actor run failed with status: {run.get('status', 'UNKNOWN') if run else 'UNKNOWN'}",
                ErrorCode.ACTOR_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time,
                    model='apify',
                    search_domains=['zillow.com']
                )
            )

        # Get the dataset items with only the hdpData field
        dataset = apify_client.dataset(run['defaultDatasetId'])
        dataset_items = dataset.list_items(fields=['hdpData'])
        items = dataset_items.items

        # Validate that we got results
        if not items or not isinstance(items, list):
            return create_error_response(
                'No properties found for the specified ZIP codes and filters',
                ErrorCode.NO_DATA,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time,
                    model='apify',
                    search_domains=['zillow.com']
                )
            )

        # Process the raw data to organize by homeType
        processed_data = process_zillow_properties(items)

        # Format the output
        output = ZillowZipSearchOutput(
            properties=items,
            processed_data=processed_data,
            total_count=len(items),
            run_id=run['id'],
            dataset_id=run['defaultDatasetId']
        )

        # Return successful result
        return create_success_response(
            data=output.model_dump(),
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time,
                model='apify',
                search_domains=['zillow.com'],
                search_scope=f"{len(search_input.zip_codes)} ZIP codes",
                extra={'result_count': len(items)}
            )
        )

    except Exception as error:
        error_msg = str(error)

        # Handle specific error types
        if 'timeout' in error_msg.lower():
            return create_error_response(
                'Zillow search timed out. Try searching fewer ZIP codes or adjusting filters.',
                ErrorCode.TIMEOUT_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        if 'rate' in error_msg.lower():
            return create_error_response(
                'Apify rate limit exceeded. Please try again later.',
                ErrorCode.RATE_LIMIT_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        if 'actor' in error_msg.lower():
            return create_error_response(
                f'Apify Actor error: {error_msg}',
                ErrorCode.ACTOR_ERROR,
                metadata=FunctionMetadata(
                    api_calls=1,
                    execution_time=time.time() - start_time
                )
            )

        return create_error_response(
            error_msg,
            ErrorCode.INTERNAL_ERROR,
            metadata=FunctionMetadata(
                api_calls=1,
                execution_time=time.time() - start_time
            )
        )


def validate_zip_codes(zip_codes: List[str]) -> Dict[str, Any]:
    """
    Validate ZIP codes format.

    Args:
        zip_codes: Array of ZIP codes to validate

    Returns:
        Dictionary with validation result and invalid ZIP codes
    """
    invalid_zips = [zip_code for zip_code in zip_codes if not (zip_code.isdigit() and len(zip_code) == 5)]
    return {
        'is_valid': len(invalid_zips) == 0,
        'invalid_zips': invalid_zips
    }


def build_zillow_search_url(zip_code: str, filters: Optional[Dict[str, Any]] = None) -> str:
    """
    Build Zillow search URL from parameters.

    Args:
        zip_code: ZIP code to search
        filters: Optional search filters

    Returns:
        Zillow search URL
    """
    url = f"https://www.zillow.com/homes/{zip_code}_rb/"
    params = []

    if filters:
        if filters.get('price_min'):
            params.append(f"{filters['price_min']}-_price")
        if filters.get('price_max'):
            params.append(f"{filters['price_max']}_price")
        if filters.get('days_on_zillow'):
            params.append(f"{filters['days_on_zillow']}_days")
        if filters.get('for_rent'):
            params.append('rent')
        if filters.get('sold'):
            params.append('sold')

    if params:
        url += '?' + '&'.join(params)

    return url


def get_home_type_stats(
    processed_data: ProcessedZillowData,
    home_type: str
) -> Optional[ZillowHomeTypeStats]:
    """
    Get summary statistics for a specific home type from processed data.

    Args:
        processed_data: The processed Zillow data
        home_type: The specific home type to get stats for

    Returns:
        Statistics for the home type or None if not found
    """
    return processed_data.by_home_type.get(home_type)


def get_addresses_by_home_type(
    processed_data: ProcessedZillowData,
    home_type: str
) -> List[str]:
    """
    Get all addresses for a specific home type from processed data.

    Args:
        processed_data: The processed Zillow data
        home_type: The specific home type

    Returns:
        Array of addresses for that home type
    """
    stats = processed_data.by_home_type.get(home_type)
    if not stats:
        return []

    return [
        f"{p.address}, {p.city}, {p.state} {p.zipcode}"
        for p in stats.properties
    ]


def filter_by_price_range(
    processed_data: ProcessedZillowData,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None
) -> ProcessedZillowData:
    """
    Filter processed data by price range.

    Args:
        processed_data: The processed Zillow data
        min_price: Minimum price filter
        max_price: Maximum price filter

    Returns:
        Filtered processed data
    """
    filtered_by_home_type = {}

    for home_type, stats in processed_data.by_home_type.items():
        # Filter properties
        filtered_properties = [
            p for p in stats.properties
            if (min_price is None or p.price >= min_price) and
               (max_price is None or p.price <= max_price)
        ]

        if filtered_properties:
            # Recalculate statistics for filtered properties
            prices = sorted([p.price for p in filtered_properties if p.price > 0])
            mid = len(prices) // 2

            filtered_stats = ZillowHomeTypeStats(
                properties=filtered_properties,
                statistics=ZillowPropertyStatistics(
                    count=len(filtered_properties),
                    min_price=min(prices) if prices else None,
                    max_price=max(prices) if prices else None,
                    median_price=(round((prices[mid - 1] + prices[mid]) / 2) if len(prices) % 2 == 0
                                 else prices[mid]) if prices else 0,
                    avg_price=round(sum(prices) / len(prices)) if prices else 0,
                    avg_price_per_sqft=stats.statistics.avg_price_per_sqft,
                    avg_price_per_bedroom=stats.statistics.avg_price_per_bedroom
                )
            )
            filtered_by_home_type[home_type] = filtered_stats

    # Calculate new summary
    total_filtered = sum(s.properties.__len__() for s in filtered_by_home_type.values())

    return ProcessedZillowData(
        by_home_type=filtered_by_home_type,
        summary={
            **processed_data.summary,
            'total_properties': total_filtered,
            'price_range': {
                'min': min_price or processed_data.summary['price_range']['min'],
                'max': max_price or processed_data.summary['price_range']['max']
            }
        }
    )
