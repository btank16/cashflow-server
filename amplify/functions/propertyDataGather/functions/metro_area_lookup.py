"""Metro area lookup function with static Ohio data."""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from enum import Enum
import time
import logging
from ..common import (
    FunctionResult,
    FunctionMetadata,
    ErrorCode,
    create_error_response,
    create_success_response
)

logger = logging.getLogger(__name__)


class LocationInfo(BaseModel):
    """Location hierarchy information."""
    neighborhood: str
    city: str
    state: str
    state_code: str


class CityInfo(BaseModel):
    """City information without neighborhood."""
    city: str
    state: str
    state_code: str


class CityWithNeighborhoods(BaseModel):
    """City with its neighborhoods."""
    city: str
    neighborhoods: List[str]


class StateHierarchy(BaseModel):
    """State hierarchy structure."""
    state: str
    state_code: str
    cities: List[CityWithNeighborhoods]


class LookupType(str, Enum):
    """Metro area lookup types."""
    NEIGHBORHOOD = 'neighborhood'
    CITY = 'city'
    STATE = 'state'
    HIERARCHY = 'hierarchy'


class MetroAreaLookupInput(BaseModel):
    """Input for metro area lookup."""
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    lookup_type: LookupType


class MetroAreaLookupOutput(BaseModel):
    """Output for metro area lookup."""
    location_info: Optional[LocationInfo] = None
    neighborhoods: Optional[List[str]] = None
    cities: Optional[List[str]] = None
    hierarchy: Optional[StateHierarchy] = None
    is_valid: Optional[bool] = None


# ============================================
# STATIC DATA - OHIO
# ============================================

# Flat map: Neighborhood -> Full location hierarchy
NEIGHBORHOOD_TO_LOCATION: Dict[str, LocationInfo] = {
    # Columbus neighborhoods
    "Short North": LocationInfo(neighborhood="Short North", city="Columbus", state="Ohio", state_code="OH"),
    "German Village": LocationInfo(neighborhood="German Village", city="Columbus", state="Ohio", state_code="OH"),
    "Clintonville": LocationInfo(neighborhood="Clintonville", city="Columbus", state="Ohio", state_code="OH"),
    "Downtown Columbus": LocationInfo(neighborhood="Downtown Columbus", city="Columbus", state="Ohio", state_code="OH"),
    "Arena District": LocationInfo(neighborhood="Arena District", city="Columbus", state="Ohio", state_code="OH"),
    "Grandview Heights": LocationInfo(neighborhood="Grandview Heights", city="Columbus", state="Ohio", state_code="OH"),
    "Victorian Village": LocationInfo(neighborhood="Victorian Village", city="Columbus", state="Ohio", state_code="OH"),
    "Italian Village": LocationInfo(neighborhood="Italian Village", city="Columbus", state="Ohio", state_code="OH"),
    "Brewery District": LocationInfo(neighborhood="Brewery District", city="Columbus", state="Ohio", state_code="OH"),
    "University District": LocationInfo(neighborhood="University District", city="Columbus", state="Ohio", state_code="OH"),
    "Bexley": LocationInfo(neighborhood="Bexley", city="Columbus", state="Ohio", state_code="OH"),
    "Upper Arlington": LocationInfo(neighborhood="Upper Arlington", city="Columbus", state="Ohio", state_code="OH"),
    "Westerville": LocationInfo(neighborhood="Westerville", city="Columbus", state="Ohio", state_code="OH"),
    "Dublin": LocationInfo(neighborhood="Dublin", city="Columbus", state="Ohio", state_code="OH"),
    "Hilliard": LocationInfo(neighborhood="Hilliard", city="Columbus", state="Ohio", state_code="OH"),

    # Cleveland neighborhoods
    "Downtown Cleveland": LocationInfo(neighborhood="Downtown Cleveland", city="Cleveland", state="Ohio", state_code="OH"),
    "Ohio City": LocationInfo(neighborhood="Ohio City", city="Cleveland", state="Ohio", state_code="OH"),
    "Tremont": LocationInfo(neighborhood="Tremont", city="Cleveland", state="Ohio", state_code="OH"),
    "University Circle": LocationInfo(neighborhood="University Circle", city="Cleveland", state="Ohio", state_code="OH"),
    "Gordon Square": LocationInfo(neighborhood="Gordon Square", city="Cleveland", state="Ohio", state_code="OH"),
    "Kamm's Corners": LocationInfo(neighborhood="Kamm's Corners", city="Cleveland", state="Ohio", state_code="OH"),
    "Edgewater": LocationInfo(neighborhood="Edgewater", city="Cleveland", state="Ohio", state_code="OH"),
    "West Park": LocationInfo(neighborhood="West Park", city="Cleveland", state="Ohio", state_code="OH"),
    "Old Brooklyn": LocationInfo(neighborhood="Old Brooklyn", city="Cleveland", state="Ohio", state_code="OH"),
    "Collinwood": LocationInfo(neighborhood="Collinwood", city="Cleveland", state="Ohio", state_code="OH"),
    "Detroit Shoreway": LocationInfo(neighborhood="Detroit Shoreway", city="Cleveland", state="Ohio", state_code="OH"),
    "Shaker Heights": LocationInfo(neighborhood="Shaker Heights", city="Cleveland", state="Ohio", state_code="OH"),
    "Cleveland Heights": LocationInfo(neighborhood="Cleveland Heights", city="Cleveland", state="Ohio", state_code="OH"),
    "Lakewood": LocationInfo(neighborhood="Lakewood", city="Cleveland", state="Ohio", state_code="OH"),
    "Little Italy": LocationInfo(neighborhood="Little Italy", city="Cleveland", state="Ohio", state_code="OH"),

    # Cincinnati neighborhoods
    "Over-the-Rhine": LocationInfo(neighborhood="Over-the-Rhine", city="Cincinnati", state="Ohio", state_code="OH"),
    "Downtown Cincinnati": LocationInfo(neighborhood="Downtown Cincinnati", city="Cincinnati", state="Ohio", state_code="OH"),
    "Hyde Park": LocationInfo(neighborhood="Hyde Park", city="Cincinnati", state="Ohio", state_code="OH"),
    "Mount Adams": LocationInfo(neighborhood="Mount Adams", city="Cincinnati", state="Ohio", state_code="OH"),
    "Oakley": LocationInfo(neighborhood="Oakley", city="Cincinnati", state="Ohio", state_code="OH"),
    "Clifton": LocationInfo(neighborhood="Clifton", city="Cincinnati", state="Ohio", state_code="OH"),
    "West End": LocationInfo(neighborhood="West End", city="Cincinnati", state="Ohio", state_code="OH"),
    "Northside": LocationInfo(neighborhood="Northside", city="Cincinnati", state="Ohio", state_code="OH"),
    "Walnut Hills": LocationInfo(neighborhood="Walnut Hills", city="Cincinnati", state="Ohio", state_code="OH"),
    "Columbia-Tusculum": LocationInfo(neighborhood="Columbia-Tusculum", city="Cincinnati", state="Ohio", state_code="OH"),
    "Madisonville": LocationInfo(neighborhood="Madisonville", city="Cincinnati", state="Ohio", state_code="OH"),
    "Mount Washington": LocationInfo(neighborhood="Mount Washington", city="Cincinnati", state="Ohio", state_code="OH"),
    "Avondale": LocationInfo(neighborhood="Avondale", city="Cincinnati", state="Ohio", state_code="OH"),
    "East Price Hill": LocationInfo(neighborhood="East Price Hill", city="Cincinnati", state="Ohio", state_code="OH"),
    "West Price Hill": LocationInfo(neighborhood="West Price Hill", city="Cincinnati", state="Ohio", state_code="OH"),

    # Dayton neighborhoods
    "Downtown Dayton": LocationInfo(neighborhood="Downtown Dayton", city="Dayton", state="Ohio", state_code="OH"),
    "Oregon District": LocationInfo(neighborhood="Oregon District", city="Dayton", state="Ohio", state_code="OH"),
    "St. Anne's Hill": LocationInfo(neighborhood="St. Anne's Hill", city="Dayton", state="Ohio", state_code="OH"),
    "South Park": LocationInfo(neighborhood="South Park", city="Dayton", state="Ohio", state_code="OH"),
    "Wright-Dunbar": LocationInfo(neighborhood="Wright-Dunbar", city="Dayton", state="Ohio", state_code="OH"),
    "Oakwood": LocationInfo(neighborhood="Oakwood", city="Dayton", state="Ohio", state_code="OH"),
    "Belmont": LocationInfo(neighborhood="Belmont", city="Dayton", state="Ohio", state_code="OH"),
    "Kettering": LocationInfo(neighborhood="Kettering", city="Dayton", state="Ohio", state_code="OH"),

    # Akron neighborhoods
    "Downtown Akron": LocationInfo(neighborhood="Downtown Akron", city="Akron", state="Ohio", state_code="OH"),
    "Highland Square": LocationInfo(neighborhood="Highland Square", city="Akron", state="Ohio", state_code="OH"),
    "West Hill": LocationInfo(neighborhood="West Hill", city="Akron", state="Ohio", state_code="OH"),
    "North Hill": LocationInfo(neighborhood="North Hill", city="Akron", state="Ohio", state_code="OH"),
    "Merriman Valley": LocationInfo(neighborhood="Merriman Valley", city="Akron", state="Ohio", state_code="OH"),
    "Fairlawn Heights": LocationInfo(neighborhood="Fairlawn Heights", city="Akron", state="Ohio", state_code="OH"),
    "Ellet": LocationInfo(neighborhood="Ellet", city="Akron", state="Ohio", state_code="OH"),
    "Goodyear Heights": LocationInfo(neighborhood="Goodyear Heights", city="Akron", state="Ohio", state_code="OH"),

    # Toledo neighborhoods
    "Downtown Toledo": LocationInfo(neighborhood="Downtown Toledo", city="Toledo", state="Ohio", state_code="OH"),
    "Old West End": LocationInfo(neighborhood="Old West End", city="Toledo", state="Ohio", state_code="OH"),
    "Warehouse District": LocationInfo(neighborhood="Warehouse District", city="Toledo", state="Ohio", state_code="OH"),
    "Point Place": LocationInfo(neighborhood="Point Place", city="Toledo", state="Ohio", state_code="OH"),
    "Ottawa Hills": LocationInfo(neighborhood="Ottawa Hills", city="Toledo", state="Ohio", state_code="OH"),
    "Reynolds Corners": LocationInfo(neighborhood="Reynolds Corners", city="Toledo", state="Ohio", state_code="OH"),
    "West Toledo": LocationInfo(neighborhood="West Toledo", city="Toledo", state="Ohio", state_code="OH"),
    "South Toledo": LocationInfo(neighborhood="South Toledo", city="Toledo", state="Ohio", state_code="OH"),
}

# Flat map: City -> State info
CITY_TO_STATE: Dict[str, CityInfo] = {
    "Columbus": CityInfo(city="Columbus", state="Ohio", state_code="OH"),
    "Cleveland": CityInfo(city="Cleveland", state="Ohio", state_code="OH"),
    "Cincinnati": CityInfo(city="Cincinnati", state="Ohio", state_code="OH"),
    "Dayton": CityInfo(city="Dayton", state="Ohio", state_code="OH"),
    "Akron": CityInfo(city="Akron", state="Ohio", state_code="OH"),
    "Toledo": CityInfo(city="Toledo", state="Ohio", state_code="OH"),
    "Canton": CityInfo(city="Canton", state="Ohio", state_code="OH"),
    "Youngstown": CityInfo(city="Youngstown", state="Ohio", state_code="OH"),
    "Parma": CityInfo(city="Parma", state="Ohio", state_code="OH"),
    "Lorain": CityInfo(city="Lorain", state="Ohio", state_code="OH"),
}


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_location_from_neighborhood(neighborhood: str) -> Optional[LocationInfo]:
    """Get full location info from a neighborhood name."""
    return NEIGHBORHOOD_TO_LOCATION.get(neighborhood)


def get_state_from_city(city: str) -> Optional[CityInfo]:
    """Get state info from a city name."""
    return CITY_TO_STATE.get(city)


def is_valid_neighborhood(neighborhood: str) -> bool:
    """Check if a neighborhood is valid (exists in our data)."""
    return neighborhood in NEIGHBORHOOD_TO_LOCATION


def is_valid_city(city: str) -> bool:
    """Check if a city is valid (exists in our data)."""
    return city in CITY_TO_STATE


def is_neighborhood_in_city(neighborhood: str, city: str) -> bool:
    """Check if a neighborhood belongs to a specific city."""
    location = NEIGHBORHOOD_TO_LOCATION.get(neighborhood)
    return location.city == city if location else False


def get_neighborhoods_for_city(city: str) -> List[str]:
    """Get all neighborhoods for a specific city."""
    neighborhoods = [
        neighborhood
        for neighborhood, location in NEIGHBORHOOD_TO_LOCATION.items()
        if location.city == city
    ]
    return sorted(neighborhoods)


def get_cities_in_state(state_code: str) -> List[str]:
    """Get all cities in a specific state."""
    cities = [
        city
        for city, location in CITY_TO_STATE.items()
        if location.state_code == state_code
    ]
    return sorted(cities)


def get_neighborhoods_in_state(state_code: str) -> List[str]:
    """Get all neighborhoods in a specific state."""
    neighborhoods = [
        neighborhood
        for neighborhood, location in NEIGHBORHOOD_TO_LOCATION.items()
        if location.state_code == state_code
    ]
    return sorted(neighborhoods)


def get_state_hierarchy(state_code: str) -> Optional[StateHierarchy]:
    """Get full hierarchy: State -> Cities -> Neighborhoods."""
    cities = get_cities_in_state(state_code)

    if not cities:
        return None

    state_info = CITY_TO_STATE.get(cities[0])
    if not state_info:
        return None

    return StateHierarchy(
        state=state_info.state,
        state_code=state_code,
        cities=[
            CityWithNeighborhoods(
                city=city,
                neighborhoods=get_neighborhoods_for_city(city)
            )
            for city in cities
        ]
    )


def search_neighborhoods(search_term: str, city: Optional[str] = None) -> List[str]:
    """Search for neighborhoods by partial name."""
    normalized_search = search_term.lower()
    results = []

    for neighborhood, location in NEIGHBORHOOD_TO_LOCATION.items():
        if normalized_search in neighborhood.lower():
            if not city or location.city == city:
                results.append(neighborhood)

    return sorted(results)


def get_metro_area_info(input_data: Dict[str, Any]) -> FunctionResult[MetroAreaLookupOutput]:
    """
    Get metro area information with consistent API interface.

    Args:
        input_data: Lookup parameters

    Returns:
        Metro area data or error
    """
    start_time = time.time()

    try:
        # Validate and parse input
        try:
            lookup_input = MetroAreaLookupInput(**input_data)
        except Exception as e:
            return create_error_response(
                str(e),
                ErrorCode.VALIDATION_ERROR
            )

        result = {}

        # Process based on lookup type
        if lookup_input.lookup_type == LookupType.NEIGHBORHOOD:
            if not lookup_input.neighborhood:
                return create_error_response(
                    'Neighborhood name is required for neighborhood lookup',
                    ErrorCode.VALIDATION_ERROR
                )

            location_info = get_location_from_neighborhood(lookup_input.neighborhood)
            if not location_info:
                return create_error_response(
                    f'Neighborhood "{lookup_input.neighborhood}" not found in database',
                    ErrorCode.NOT_FOUND
                )

            result['location_info'] = location_info.model_dump()
            result['is_valid'] = True

        elif lookup_input.lookup_type == LookupType.CITY:
            if not lookup_input.city:
                return create_error_response(
                    'City name is required for city lookup',
                    ErrorCode.VALIDATION_ERROR
                )

            neighborhoods = get_neighborhoods_for_city(lookup_input.city)
            if not neighborhoods:
                return create_error_response(
                    f'City "{lookup_input.city}" not found or has no neighborhoods in database',
                    ErrorCode.NOT_FOUND
                )

            result['neighborhoods'] = neighborhoods
            result['is_valid'] = is_valid_city(lookup_input.city)

        elif lookup_input.lookup_type == LookupType.STATE:
            if not lookup_input.state_code:
                return create_error_response(
                    'State code is required for state lookup',
                    ErrorCode.VALIDATION_ERROR
                )

            cities = get_cities_in_state(lookup_input.state_code)
            neighborhoods = get_neighborhoods_in_state(lookup_input.state_code)

            result['cities'] = cities
            result['neighborhoods'] = neighborhoods
            result['is_valid'] = len(cities) > 0

        elif lookup_input.lookup_type == LookupType.HIERARCHY:
            if not lookup_input.state_code:
                return create_error_response(
                    'State code is required for hierarchy lookup',
                    ErrorCode.VALIDATION_ERROR
                )

            hierarchy = get_state_hierarchy(lookup_input.state_code)
            if not hierarchy:
                return create_error_response(
                    f'State "{lookup_input.state_code}" not found in database',
                    ErrorCode.NOT_FOUND
                )

            result['hierarchy'] = hierarchy.model_dump()
            result['is_valid'] = True

        else:
            return create_error_response(
                'Invalid lookup type. Must be one of: neighborhood, city, state, hierarchy',
                ErrorCode.VALIDATION_ERROR
            )

        return create_success_response(
            data=result,
            metadata=FunctionMetadata(
                api_calls=0,  # No API calls for static data
                execution_time=time.time() - start_time,
                cache_hit=True  # Always cache hit since it's static data
            )
        )

    except Exception as error:
        return create_error_response(
            str(error),
            ErrorCode.INTERNAL_ERROR,
            metadata=FunctionMetadata(
                api_calls=0,
                execution_time=time.time() - start_time
            )
        )
