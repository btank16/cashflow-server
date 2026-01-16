"""Property data gathering functions."""

from .gemini_apartment_comps import get_gemini_apartment_comps, ApartmentCompsInput, ApartmentCompsOutput
from .property_details import get_initial_property_info, InitialPropertyInfoInput, InitialPropertyInfoOutput
from .property_tax import get_property_tax, PropertyTaxRealtorInput, PropertyTaxRealtorOutput
from .recent_sales import get_recent_sale_info, RecentSaleInfoInput, RecentSaleInfoOutput
from .interest_rates import (
    get_interest_rate,
    InterestRateFinalInput,
    InterestRateFinalOutput,
    adjust_interest_rate,
    AdjustedInterestRateInput,
    AdjustedInterestRateOutput
)
from .comparable_sales import get_comparable_sales, ComparableSalesInput, ComparableSalesOutput
from .similar_areas import get_similar_areas, SimilarAreasInput, SimilarAreasOutput
from .geocoding import get_coordinates, GeocodingInput, batch_geocode_addresses
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
from .median_analysis import (
    get_five_number_summary,
    FiveNumberSummaryInput,
    FiveNumberSummaryOutput,
    RangeOutput,
    SingleValueOutput,
    filter_iqr_outliers,
    OutlierFilterResult
)
from .address_checker import (
    check_addresses_against_polygon,
    batch_classify_addresses
)
from .boundary_builder import (
    build_boundary_polygon,
    expand_boundary_polygon,
    BoundaryBuilder
)
from .osm_fetcher import fetch_osm_ways

__all__ = [
    # Gemini apartment comps
    'get_gemini_apartment_comps',
    'ApartmentCompsInput',
    'ApartmentCompsOutput',
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
    'adjust_interest_rate',
    'AdjustedInterestRateInput',
    'AdjustedInterestRateOutput',
    # Comparable sales
    'get_comparable_sales',
    'ComparableSalesInput',
    'ComparableSalesOutput',
    # Similar areas
    'get_similar_areas',
    'SimilarAreasInput',
    'SimilarAreasOutput',
    # Geocoding
    'get_coordinates',
    'GeocodingInput',
    'batch_geocode_addresses',
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
    'PropertySalesOutput',
    # Median analysis
    'get_five_number_summary',
    'FiveNumberSummaryInput',
    'FiveNumberSummaryOutput',
    'RangeOutput',
    'SingleValueOutput',
    'filter_iqr_outliers',
    'OutlierFilterResult',
    # Address checker
    'check_addresses_against_polygon',
    'batch_classify_addresses',
    # Boundary builder
    'build_boundary_polygon',
    'expand_boundary_polygon',
    'BoundaryBuilder',
    # OSM fetcher
    'fetch_osm_ways'
]
