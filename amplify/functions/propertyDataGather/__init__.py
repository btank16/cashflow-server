"""
Property Data Gathering Module

This module provides a comprehensive suite of functions for gathering real estate property data
using the Perplexity AI API for research queries and Apify for web scraping.

Main Functions:
    - get_county_name: Get county for a city/state
    - get_neighborhood_name: Get neighborhood for an address
    - get_initial_property_info: Get property specs (units, sq ft, beds, baths)
    - get_property_tax: Get property tax from Realtor.com
    - get_recent_sale_info: Get recent sale information
    - get_interest_rate: Get current mortgage interest rates
    - get_comparable_sales: Find comparable properties
    - get_similar_areas: Find similar neighborhoods or cities
    - get_apartment_comps: Search for rental apartments
    - search_zillow_by_zip: Search Zillow by ZIP code (via Apify)
    - get_rentcast_property_records: Search property records (via Rentcast)
    - get_rentcast_rental_listings: Search rental listings (via Rentcast)
    - get_rentcast_market_stats: Get market statistics by ZIP (via Rentcast)
    - get_metro_area_info: Static metro area data lookup

Usage:
    from propertyDataGather import get_county_name
    from propertyDataGather.common import PerplexityClient
    from propertyDataGather.config import PERPLEXITY_API_KEY

    client = PerplexityClient(PERPLEXITY_API_KEY)
    result = get_county_name(
        {'city_name': 'Columbus', 'state_name': 'Ohio'},
        client
    )

    if result.success:
        print(result.data['county_name'])
"""

from . import config
from . import common
# Note: 'functions' is not auto-imported to avoid loading dependencies (e.g., apify-client)
# that may not be needed by all consumers. Import specific functions directly:
#   from propertyDataGather.functions.geocoding import get_coordinates
#   from propertyDataGather.functions import get_county_name

__version__ = '1.0.0'

__all__ = [
    'config',
    'common'
]
