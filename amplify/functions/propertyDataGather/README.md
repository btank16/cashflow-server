# Property Data Gathering - Python Implementation

This directory contains the Python implementation of the property data gathering functions for real estate analysis.

## Overview

The module provides 14 core functions for gathering comprehensive property data:

### Perplexity-based Functions (9)
1. **County Lookup** - Get county name from city/state
2. **Neighborhood Lookup** - Get neighborhood from address
3. **Property Details** - Get units, sq ft, beds, baths
4. **Property Tax** - Get annual property tax
5. **Recent Sales** - Get recent sale date and price
6. **Interest Rates** - Get current mortgage rates
7. **Comparable Sales** - Find similar properties
8. **Similar Areas** - Find similar neighborhoods/cities
9. **Apartment Search** - Search rental units

### Apify-based Functions (1)
10. **Zillow ZIP Search** - Search properties by ZIP code

### Rentcast API Functions (3)
11. **Property Records** - Search property records
12. **Rental Listings** - Search rental listings
13. **Market Statistics** - Get market data by ZIP code

### Static Data Functions (1)
14. **Metro Area Lookup** - Ohio cities/neighborhoods lookup

## Directory Structure

```
propertyDataGather/
├── __init__.py              # Main module exports
├── README.md                # This file
├── requirements.txt         # Python dependencies
├── config.py                # Configuration and constants
│
├── common/                  # Common utilities
│   ├── __init__.py
│   ├── types.py            # Type definitions (Pydantic models)
│   ├── utils.py            # Validation, response formatting, retry logic
│   └── perplexity_client.py # Perplexity API wrapper
│
└── functions/              # Core function implementations
    ├── __init__.py
    ├── county_lookup.py
    ├── neighborhood_lookup.py
    ├── property_details.py
    ├── property_tax.py
    ├── recent_sales.py
    ├── interest_rates.py
    ├── comparable_sales.py
    ├── similar_areas.py
    ├── apartment_search.py
    ├── metro_area_lookup.py
    └── zillow_zip_search.py
```

## Installation

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Dependencies
- `perplexityai==0.19.1` - Official Perplexity SDK
- `apify-client==2.2.1` - Apify web scraping client
- `pydantic>=2.5.3,<3.0.0` - Data validation
- `tenacity>=9.1.0,<10.0.0` - Retry logic
- `typing-extensions>=4.10.0,<5.0.0` - Type hints
- `requests>=2.31.0` - HTTP client for Rentcast API

## Configuration

Set up your environment variables:

```bash
export PERPLEXITY_API_KEY="your-perplexity-api-key"
export APIFY_API_KEY="your-apify-api-key"
export RENTCAST_API_KEY="your-rentcast-api-key"
```

Or use a `.env` file:

```
PERPLEXITY_API_KEY=your-perplexity-api-key
APIFY_API_KEY=your-apify-api-key
RENTCAST_API_KEY=your-rentcast-api-key
```

## Usage Examples

### County Lookup

```python
from propertyDataGather.functions import get_county_name
from propertyDataGather.common import PerplexityClient
from propertyDataGather.config import PERPLEXITY_API_KEY

# Initialize client
client = PerplexityClient(PERPLEXITY_API_KEY)

# Get county name
result = get_county_name(
    {'city_name': 'Columbus', 'state_name': 'Ohio'},
    client
)

if result.success:
    print(f"County: {result.data['county_name']}")
    print(f"Execution time: {result.metadata.execution_time}s")
else:
    print(f"Error: {result.error}")
```

### Property Details

```python
from propertyDataGather.functions import get_initial_property_info
from propertyDataGather.common import PerplexityClient
from propertyDataGather.config import PERPLEXITY_API_KEY

client = PerplexityClient(PERPLEXITY_API_KEY)

result = get_initial_property_info(
    {
        'street': '123 Main St',
        'city': 'Columbus',
        'state': 'Ohio',
        'zip': '43215',
        'county_name': 'Franklin'
    },
    client
)

if result.success:
    data = result.data
    print(f"Total Units: {data['total_units']}")
    print(f"Total Sq Ft: {data['total_sq_ft']}")
    print(f"Bedrooms per unit: {data['unit_bed']}")
```

### Zillow ZIP Search

```python
from propertyDataGather.functions import search_zillow_by_zip
from apify_client import ApifyClient
from propertyDataGather.config import APIFY_API_KEY

# Initialize Apify client
client = ApifyClient(APIFY_API_KEY)

result = search_zillow_by_zip(
    {
        'zip_codes': ['43215', '43201'],
        'price_min': 200000,
        'price_max': 500000,
        'for_sale_by_agent': True,
        'max_items': 50
    },
    client
)

if result.success:
    data = result.data
    print(f"Total properties: {data['total_count']}")
    print(f"Home types: {data['processed_data']['summary']['home_types']}")

    # Access statistics by home type
    for home_type, stats in data['processed_data']['by_home_type'].items():
        print(f"\n{home_type}:")
        print(f"  Count: {stats['statistics']['count']}")
        print(f"  Median Price: ${stats['statistics']['median_price']:,.0f}")
```

### City Validation

```python
from propertyDataGather.functions import is_valid_city

# Check if a city is in the supported metro areas
if is_valid_city("Columbus"):
    print("Columbus is a supported city")

# Currently supports Ohio cities: Columbus, Cleveland, Cincinnati,
# Dayton, Akron, Toledo, Canton, Youngstown, Parma, Lorain
```

### Rentcast Property Records

```python
from propertyDataGather.functions import get_rentcast_property_records
from propertyDataGather.common import RentcastClient
from propertyDataGather.config import RENTCAST_API_KEY

# Initialize Rentcast client
client = RentcastClient(RENTCAST_API_KEY)

# Search properties by ZIP code
result = get_rentcast_property_records(
    {
        'zip_code': '43215',
        'property_type': 'Single Family',
        'bedrooms': '3:5',
        'limit': 50
    },
    client
)

if result.success:
    properties = result.data['properties']
    print(f"Found {result.data['total_count']} properties")
    for prop in properties[:5]:
        print(f"Address: {prop.get('formattedAddress')}")
        print(f"Bedrooms: {prop.get('bedrooms')}, Bathrooms: {prop.get('bathrooms')}")
        print(f"Last Sale: ${prop.get('lastSalePrice')}")
```

### Rentcast Rental Listings

```python
from propertyDataGather.functions import get_rentcast_rental_listings
from propertyDataGather.common import RentcastClient
from propertyDataGather.config import RENTCAST_API_KEY

client = RentcastClient(RENTCAST_API_KEY)

# Search rental listings
result = get_rentcast_rental_listings(
    {
        'city': 'Columbus',
        'state': 'OH',
        'bedrooms': '2:3',
        'price': '1000:2000',
        'status': 'Active',
        'limit': 25
    },
    client
)

if result.success:
    listings = result.data['listings']
    print(f"Found {result.data['total_count']} active rentals")
    for listing in listings[:5]:
        print(f"Address: {listing.get('formattedAddress')}")
        print(f"Price: ${listing.get('price')}/month")
        print(f"Bedrooms: {listing.get('bedrooms')}, Bathrooms: {listing.get('bathrooms')}")
```

### Rentcast Market Statistics

```python
from propertyDataGather.functions import get_rentcast_market_stats
from propertyDataGather.common import RentcastClient
from propertyDataGather.config import RENTCAST_API_KEY

client = RentcastClient(RENTCAST_API_KEY)

# Get market statistics for a ZIP code
result = get_rentcast_market_stats(
    {
        'zip_code': '43215',
        'data_type': 'All',
        'history_range': 12
    },
    client
)

if result.success:
    data = result.data

    if data['sale_data']:
        sale = data['sale_data']
        print(f"Sale Market - Average Price: ${sale.get('averagePrice')}")
        print(f"Median Price: ${sale.get('medianPrice')}")
        print(f"Total Listings: {sale.get('totalListings')}")

    if data['rental_data']:
        rental = data['rental_data']
        print(f"Rental Market - Average Rent: ${rental.get('averageRent')}/month")
        print(f"Median Rent: ${rental.get('medianRent')}/month")
```

## Function Reference

### County Lookup
- **Function**: `get_county_name(input_data, perplexity_client)`
- **Input**: `{city_name, state_name}`
- **Output**: `{county_name}`
- **Model**: Perplexity `sonar`

### Neighborhood Lookup
- **Function**: `get_neighborhood_name(input_data, perplexity_client)`
- **Input**: `{street, city, state, zip}`
- **Output**: `{neighborhood}`
- **Model**: Perplexity `sonar`
- **Domains**: zillow.com

### Property Details
- **Function**: `get_initial_property_info(input_data, perplexity_client)`
- **Input**: `{street, city, state, zip, county_name}`
- **Output**: `{total_units, total_sq_ft, total_beds, total_bath, unit_sq_ft[], unit_bed[], unit_bath[]}`
- **Model**: Perplexity `sonar`
- **Retries**: 2 attempts with validation

### Property Tax
- **Function**: `get_property_tax(input_data, perplexity_client)`
- **Input**: `{street, city, state, zip, year}`
- **Output**: `{annual_taxes}`
- **Model**: Perplexity `sonar`
- **Domains**: realtor.com

### Recent Sales
- **Function**: `get_recent_sale_info(input_data, perplexity_client)`
- **Input**: `{street, city, state, zip}`
- **Output**: `{sale_date, sale_price}`
- **Model**: Perplexity `sonar`
- **Domains**: realtor.com, redfin.com

### Interest Rates
- **Function**: `get_interest_rate(input_data, perplexity_client)`
- **Input**: `{state_name, down_payment, loan_type}`
- **Output**: `{interest_rate}`
- **Model**: Perplexity `sonar`
- **Domains**: freddiemac.com, nerdwallet.com, bankrate.com

### Comparable Sales
- **Function**: `get_comparable_sales(input_data, perplexity_client)`
- **Input**: `{street, city, state, zip, property_type, neighborhood?}`
- **Output**: `{addresses[]}`
- **Model**: Perplexity `sonar`
- **Domains**: zillow.com

### Similar Areas
- **Function**: `get_similar_areas(input_data, perplexity_client)`
- **Input**: `{city, state, neighborhood}` OR `{county_name, city_name, state_name}`
- **Output**: `{similar_areas[]}`
- **Model**: Perplexity `sonar`

### Apartment Search
- **Function**: `get_apartment_comps(input_data, perplexity_client)`
- **Input**: `{city, state, bed_count, bath_count, neighborhood?}`
- **Output**: `{addresses[]}`
- **Model**: Perplexity `sonar-pro`
- **Domains**: redfin.com, apartments.com, zillow.com

### Zillow ZIP Search
- **Function**: `search_zillow_by_zip(input_data, apify_client)`
- **Input**: `{zip_codes[], price_min?, price_max?, days_on_zillow?, for_sale_by_agent?, for_sale_by_owner?, for_rent?, sold?, max_items?}`
- **Output**: `{properties[], processed_data, total_count, run_id, dataset_id}`
- **API**: Apify actor `maxcopell/zillow-zip-search`
- **Timeout**: 5 minutes

### City Validation
- **Function**: `is_valid_city(city)`
- **Input**: City name string
- **Output**: Boolean
- **API Calls**: 0 (static data)
- **Data**: Supported Ohio cities

### Rentcast Property Records
- **Function**: `get_rentcast_property_records(input_data, rentcast_client)`
- **Input**: `{address?, city?, state?, zip_code?, latitude?, longitude?, radius?, property_type?, bedrooms?, bathrooms?, square_footage?, year_built?, limit?, offset?}`
- **Output**: `{properties[], total_count}`
- **API**: Rentcast `/v1/properties`
- **Rate Limit**: 20 requests/second
- **Returns**: Raw property records from Rentcast API

### Rentcast Rental Listings
- **Function**: `get_rentcast_rental_listings(input_data, rentcast_client)`
- **Input**: `{address?, city?, state?, zip_code?, latitude?, longitude?, radius?, property_type?, bedrooms?, bathrooms?, price?, days_old?, status?, limit?, offset?}`
- **Output**: `{listings[], total_count}`
- **API**: Rentcast `/v1/listings/rental/long-term`
- **Rate Limit**: 20 requests/second
- **Returns**: Raw rental listing data from Rentcast API

### Rentcast Market Statistics
- **Function**: `get_rentcast_market_stats(input_data, rentcast_client)`
- **Input**: `{zip_code, data_type?, history_range?}`
- **Output**: `{zip_code, sale_data?, rental_data?}`
- **API**: Rentcast `/v1/markets`
- **Rate Limit**: 20 requests/second
- **Returns**: Raw market statistics from Rentcast API
- **Data Types**: "All" (default), "Sale", or "Rental"

## Error Handling

All functions return a `FunctionResult` object with:

```python
{
    'success': bool,
    'data': dict | None,
    'error': str | None,
    'error_code': ErrorCode | None,
    'metadata': {
        'api_calls': int,
        'execution_time': float,
        'model': str,
        'search_domains': list,
        'cache_hit': bool,
        'search_scope': str
    }
}
```

### Error Codes
- `VALIDATION_ERROR` - Invalid input
- `API_ERROR` - External API failure
- `NO_DATA` - No data found
- `DATA_VALIDATION_ERROR` - Invalid response data
- `CONFIG_ERROR` - Configuration issue
- `INTERNAL_ERROR` - Unexpected error
- `NOT_FOUND` - Data not found
- `TIMEOUT_ERROR` - Request timeout
- `RATE_LIMIT_ERROR` - Rate limit exceeded
- `ACTOR_ERROR` - Apify actor error

## Type Safety

All functions use Pydantic models for input/output validation:

```python
from propertyDataGather.functions import CountyNameInput, CountyNameOutput

# Type-safe input
input_data = CountyNameInput(
    city_name='Columbus',
    state_name='Ohio'
)

# Validation happens automatically
result = get_county_name(input_data.model_dump(), client)

# Type-safe output
if result.success:
    output = CountyNameOutput(**result.data)
    print(output.county_name)
```

## Retry Logic

Functions use exponential backoff for retries:
- Default: 3 attempts
- Initial delay: 1 second
- Max delay: 10 seconds
- Exponential base: 2.0

Property details function has custom retry with validation.

## AWS Amplify Integration

These functions can be easily integrated into AWS Lambda handlers. See the AWS Amplify Gen 2 documentation for creating Python Lambda functions.

Example Lambda handler structure:

```python
import os
from propertyDataGather.functions import get_county_name
from propertyDataGather.common import PerplexityClient

def lambda_handler(event, context):
    api_key = os.environ['PERPLEXITY_API_KEY']
    client = PerplexityClient(api_key)

    result = get_county_name(event, client)

    return {
        'statusCode': 200 if result.success else 400,
        'body': result.model_dump()
    }
```

## Testing

You can test functions directly:

```python
# Test county lookup
from propertyDataGather.functions import get_county_name
from propertyDataGather.common import PerplexityClient
import os

client = PerplexityClient(os.getenv('PERPLEXITY_API_KEY'))

test_cases = [
    {'city_name': 'Columbus', 'state_name': 'Ohio'},
    {'city_name': 'Cleveland', 'state_name': 'Ohio'},
    {'city_name': 'Cincinnati', 'state_name': 'Ohio'}
]

for test in test_cases:
    result = get_county_name(test, client)
    print(f"{test['city_name']}: {result.data['county_name'] if result.success else result.error}")
```

## Performance

Typical execution times:
- County/Neighborhood lookup: 2-5 seconds
- Property details: 5-10 seconds (with retries)
- Property tax/Recent sales: 2-5 seconds
- Interest rates: 2-5 seconds
- Comparable sales: 2-5 seconds
- Similar areas: 2-5 seconds
- Apartment search: 5-10 seconds (sonar-pro)
- Zillow search: 30-300 seconds (depends on results)
- Rentcast property records: 1-3 seconds
- Rentcast rental listings: 1-3 seconds
- Rentcast market statistics: 1-2 seconds
- Metro area lookup: <1ms (static data)

## License

Part of the Cashflow Real Estate Analysis platform.
