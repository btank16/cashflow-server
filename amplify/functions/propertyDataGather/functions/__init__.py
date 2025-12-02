"""Property data gathering functions."""

from .county_lookup import get_county_name, CountyNameInput, CountyNameOutput
from .neighborhood_lookup import get_neighborhood_name, NeighborhoodNameInput, NeighborhoodNameOutput
from .property_details import get_initial_property_info, InitialPropertyInfoInput, InitialPropertyInfoOutput
from .property_tax import get_property_tax, PropertyTaxRealtorInput, PropertyTaxRealtorOutput
from .recent_sales import get_recent_sale_info, RecentSaleInfoInput, RecentSaleInfoOutput
from .interest_rates import get_interest_rate, InterestRateFinalInput, InterestRateFinalOutput
from .comparable_sales import get_comparable_sales, ComparableSalesInput, ComparableSalesOutput
from .similar_areas import get_similar_areas, SimilarAreasInput, SimilarAreasOutput
from .apartment_search import get_apartment_comps, ApartmentCompInput, ApartmentCompOutput, deduplicate_addresses
from .geocoding import get_coordinates, GeocodingInput, batch_geocode_addresses
from .zillow_zip_search import (
    search_zillow_by_zip,
    ZillowZipSearchInput,
    ZillowZipSearchOutput,
    ProcessedZillowData,
    ZillowPropertyInfo,
    ZillowPropertyStatistics,
    validate_zip_codes,
    build_zillow_search_url,
    get_home_type_stats,
    get_addresses_by_home_type,
    filter_by_price_range
)
from .metro_area_lookup import (
    get_metro_area_info,
    MetroAreaLookupInput,
    MetroAreaLookupOutput,
    LocationInfo,
    StateHierarchy,
    get_location_from_neighborhood,
    get_state_from_city,
    is_valid_neighborhood,
    is_valid_city,
    is_neighborhood_in_city,
    get_neighborhoods_for_city,
    get_cities_in_state,
    get_neighborhoods_in_state,
    get_state_hierarchy,
    search_neighborhoods
)
from .rentcast_data import (
    get_rentcast_property_records,
    get_rentcast_rental_listings,
    get_rentcast_sale_listings,
    get_rentcast_market_stats,
    RentcastPropertyRecordsInput,
    RentcastPropertyRecordsOutput,
    RentcastListingsInput,
    RentcastListingsOutput,
    RentcastMarketStatsInput,
    RentcastMarketStatsOutput
)
from .gemini_property_sales import (
    get_recent_property_sales,
    PropertySalesInput,
    PropertySalesOutput
)

__all__ = [
    # County lookup
    'get_county_name',
    'CountyNameInput',
    'CountyNameOutput',
    # Neighborhood lookup
    'get_neighborhood_name',
    'NeighborhoodNameInput',
    'NeighborhoodNameOutput',
    # Property details
    'get_initial_property_info',
    'InitialPropertyInfoInput',
    'InitialPropertyInfoOutput',
    # Property tax
    'get_property_tax',
    'PropertyTaxRealtorInput',
    'PropertyTaxRealtorOutput',
    # Recent sales
    'get_recent_sale_info',
    'RecentSaleInfoInput',
    'RecentSaleInfoOutput',
    # Interest rates
    'get_interest_rate',
    'InterestRateFinalInput',
    'InterestRateFinalOutput',
    # Comparable sales
    'get_comparable_sales',
    'ComparableSalesInput',
    'ComparableSalesOutput',
    # Similar areas
    'get_similar_areas',
    'SimilarAreasInput',
    'SimilarAreasOutput',
    # Apartment search
    'get_apartment_comps',
    'ApartmentCompInput',
    'ApartmentCompOutput',
    'deduplicate_addresses',
    # Geocoding
    'get_coordinates',
    'GeocodingInput',
    'batch_geocode_addresses',
    # Zillow search
    'search_zillow_by_zip',
    'ZillowZipSearchInput',
    'ZillowZipSearchOutput',
    'ProcessedZillowData',
    'ZillowPropertyInfo',
    'ZillowPropertyStatistics',
    'validate_zip_codes',
    'build_zillow_search_url',
    'get_home_type_stats',
    'get_addresses_by_home_type',
    'filter_by_price_range',
    # Metro area lookup
    'get_metro_area_info',
    'MetroAreaLookupInput',
    'MetroAreaLookupOutput',
    'LocationInfo',
    'StateHierarchy',
    'get_location_from_neighborhood',
    'get_state_from_city',
    'is_valid_neighborhood',
    'is_valid_city',
    'is_neighborhood_in_city',
    'get_neighborhoods_for_city',
    'get_cities_in_state',
    'get_neighborhoods_in_state',
    'get_state_hierarchy',
    'search_neighborhoods',
    # Rentcast data
    'get_rentcast_property_records',
    'get_rentcast_rental_listings',
    'get_rentcast_sale_listings',
    'get_rentcast_market_stats',
    'RentcastPropertyRecordsInput',
    'RentcastPropertyRecordsOutput',
    'RentcastListingsInput',
    'RentcastListingsOutput',
    'RentcastMarketStatsInput',
    'RentcastMarketStatsOutput',
    # Gemini property sales
    'get_recent_property_sales',
    'PropertySalesInput',
    'PropertySalesOutput'
]
