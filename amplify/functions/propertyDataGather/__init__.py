"""
Property Data Gathering Module

This module provides a comprehensive suite of functions for gathering real estate property data
using the Perplexity AI API for research queries and Rentcast for property data.

Main Functions:
    - get_initial_property_info: Get property specs (units, sq ft, beds, baths)
    - get_property_tax: Get property tax from Realtor.com
    - get_recent_sale_info: Get recent sale information
    - get_interest_rate: Get current mortgage interest rates
    - get_comparable_sales: Find comparable properties
    - get_similar_areas: Find similar neighborhoods or cities
    - get_gemini_apartment_comps: Search for rental apartments (via Gemini)
    - get_rentcast_property_records: Search property records (via Rentcast)
    - get_rentcast_rental_listings: Search rental listings (via Rentcast)
    - get_rentcast_market_stats: Get market statistics by ZIP (via Rentcast)

Usage:
    from propertyDataGather.functions import get_interest_rate
    from propertyDataGather.common import PerplexityClient
    from propertyDataGather.config import PERPLEXITY_API_KEY

    client = PerplexityClient(PERPLEXITY_API_KEY)
    result = get_interest_rate(
        {'state_name': 'Ohio', 'down_payment': 20, 'loan_type': '30-year fixed'},
        client
    )

    if result.success:
        print(result.data['interest_rate'])
"""

from . import config
from . import common
# Note: 'functions' is not auto-imported to allow selective imports.
# Import specific functions directly:
#   from propertyDataGather.functions.geocoding import get_coordinates
#   from propertyDataGather.functions import get_interest_rate

__version__ = '1.0.0'

__all__ = [
    'config',
    'common'
]
