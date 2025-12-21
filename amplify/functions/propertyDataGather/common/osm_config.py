"""Configuration for OpenStreetMap way types and Overpass API queries."""

import math
from typing import Dict, List

# Radius configuration
MILES_TO_DEGREES_LAT = 0.0144927536  # 1 mile ≈ 0.0145 degrees latitude
DEFAULT_RADIUS_MILES = 2.0

# OSM Way Types - Used for Overpass API queries
OSM_WAY_TYPES: Dict[str, List[str]] = {
    "highways": [
        "motorway",
        "trunk",
        "primary",
        "secondary"
    ],
    "railways": [
        "rail",
        "light_rail",
        "subway",
        "tram",
        "narrow_gauge",
        "preserved",
        "miniature",
        "monorail",
        "funicular"
    ],
    "waterways": [
        # Natural waterways
        "river",
        "stream",
        "tidal_channel",
        # Man-made waterways
        "canal",
        "drain",
        "ditch"
    ]
}

# =============================================================================
# Boundary Classification for Polygon Expansion
# =============================================================================
# Hard boundaries: Never cross during polygon expansion (major roads, bbox edges)
# Tier 3 boundaries: Only cross when data is insufficient (≤2 points after tier 2)
# Soft boundaries: Can expand through these (secondary roads, railways, waterways)

HARD_BOUNDARY_TYPES: List[str] = [
    # Major highways - act as neighborhood dividers (never cross)
    "motorway",
    "trunk",
    # Major waterways - act as neighborhood dividers (never cross)
    "river",
]

TIER_THREE_BOUNDARY_TYPES: List[str] = [
    # Primary roads - only cross in tier 3 when data is insufficient
    "primary",
]

SOFT_BOUNDARY_TYPES: List[str] = [
    # Secondary roads - can expand through
    "secondary",
    # Railways - can expand through
    "rail",
    "light_rail",
    "subway",
    "tram",
    "narrow_gauge",
    "preserved",
    "miniature",
    "monorail",
    "funicular",
    # Waterways - can expand through (except river, which is hard)
    "stream",
    "tidal_channel",
    "canal",
    "drain",
    "ditch",
]

# Lookup dictionary for O(1) boundary classification
WAY_BOUNDARY_CLASS: Dict[str, str] = {
    # Hard boundaries (never cross)
    "motorway": "hard",
    "trunk": "hard",
    # Tier 3 boundaries (only cross when data insufficient)
    "primary": "tier_three",
    # Soft boundaries - highways
    "secondary": "soft",
    # Soft boundaries - railways
    "rail": "soft",
    "light_rail": "soft",
    "subway": "soft",
    "tram": "soft",
    "narrow_gauge": "soft",
    "preserved": "soft",
    "miniature": "soft",
    "monorail": "soft",
    "funicular": "soft",
    # Hard boundaries - waterways
    "river": "hard",
    # Soft boundaries - waterways
    "stream": "soft",
    "tidal_channel": "soft",
    "canal": "soft",
    "drain": "soft",
    "ditch": "soft",
}

# Special boundary class for bounding box edges (always hard)
BBOX_BOUNDARY_CLASS = "hard"


def get_boundary_class(way_type: str) -> str:
    """
    Get the boundary classification for a way type.

    Args:
        way_type: OSM way type (e.g., "motorway", "secondary", "rail")

    Returns:
        "hard" or "soft" boundary classification

    Example:
        >>> get_boundary_class("motorway")
        'hard'
        >>> get_boundary_class("secondary")
        'soft'
    """
    return WAY_BOUNDARY_CLASS.get(way_type, "soft")


def is_hard_boundary(way_type: str) -> bool:
    """
    Check if a way type is a hard boundary (cannot expand through).

    Args:
        way_type: OSM way type

    Returns:
        True if hard boundary, False otherwise
    """
    return get_boundary_class(way_type) == "hard"


def is_soft_boundary(way_type: str) -> bool:
    """
    Check if a way type is a soft boundary (can expand through).

    Args:
        way_type: OSM way type

    Returns:
        True if soft boundary, False otherwise
    """
    return get_boundary_class(way_type) == "soft"


def is_tier_three_boundary(way_type: str) -> bool:
    """
    Check if a way type is a tier 3 boundary (can cross only when data insufficient).

    Tier 3 boundaries (e.g., primary roads) are only crossed when the filtered
    data count is ≤ min_data_for_tier_three after tier 1-2 expansion.

    Args:
        way_type: OSM way type

    Returns:
        True if tier 3 boundary, False otherwise
    """
    return get_boundary_class(way_type) == "tier_three"


def build_overpass_query(bbox: List[float], way_types: Dict[str, List[str]] = None) -> str:
    """
    Build an OverpassQL query to fetch ways within a bounding box.

    Args:
        bbox: Bounding box as [min_lat, max_lat, min_lon, max_lon]
        way_types: Dictionary of way types to query (uses OSM_WAY_TYPES if None)

    Returns:
        OverpassQL query string

    Example:
        >>> bbox = [41.47, 41.53, -81.85, -81.75]
        >>> query = build_overpass_query(bbox)
    """
    if way_types is None:
        way_types = OSM_WAY_TYPES

    # Convert bbox to Overpass format: south, north, west, east
    min_lat, max_lat, min_lon, max_lon = bbox
    bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"

    # Build query parts for each way type category
    query_parts = []

    # Highways
    if "highways" in way_types and way_types["highways"]:
        highway_types = "|".join(way_types["highways"])
        query_parts.append(f'  way["highway"~"{highway_types}"]({bbox_str});')

    # Railways
    if "railways" in way_types and way_types["railways"]:
        railway_types = "|".join(way_types["railways"])
        query_parts.append(f'  way["railway"~"{railway_types}"]({bbox_str});')

    # Waterways
    if "waterways" in way_types and way_types["waterways"]:
        waterway_types = "|".join(way_types["waterways"])
        query_parts.append(f'  way["waterway"~"{waterway_types}"]({bbox_str});')

    # Combine into full query
    query = f"""[out:json][timeout:25];
(
{chr(10).join(query_parts)}
);
out geom;"""

    return query


# Overpass API configuration
OVERPASS_API_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 30  # seconds
OVERPASS_RATE_LIMIT_DELAY = 2.0  # seconds between requests (conservative)

# Boundary construction parameters
MAX_INTERPOLATION_DISTANCE = 0.01  # ~1km for dangling way closure
BOUNDARY_BUFFER_DISTANCE = 0.00001  # ~1m for boundary detection
POLYGON_MIN_AREA = 0.000001  # Minimum polygon area in square degrees
POLYGON_MAX_AREA = 1.0  # Maximum polygon area in square degrees (sanity check)


def calculate_radius_bbox(
    lat: float,
    lon: float,
    radius_miles: float = DEFAULT_RADIUS_MILES
) -> List[float]:
    """
    Calculate bounding box for a radius around coordinates.

    Args:
        lat: Latitude of center point
        lon: Longitude of center point
        radius_miles: Radius in miles (default 2.0)

    Returns:
        [min_lat, max_lat, min_lon, max_lon]

    Example:
        >>> bbox = calculate_radius_bbox(41.476, -81.786, 2.0)
        >>> # Returns bbox for 2-mile radius around Cleveland address
    """
    # Convert miles to degrees latitude
    lat_offset = radius_miles * MILES_TO_DEGREES_LAT

    # Longitude degrees vary by latitude (cosine adjustment)
    lon_offset = lat_offset / math.cos(math.radians(lat))

    return [
        lat - lat_offset,  # min_lat
        lat + lat_offset,  # max_lat
        lon - lon_offset,  # min_lon
        lon + lon_offset   # max_lon
    ]


def haversine_distance_miles(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float
) -> float:
    """
    Calculate the great-circle distance between two points using the Haversine formula.

    Args:
        lat1: Latitude of first point
        lon1: Longitude of first point
        lat2: Latitude of second point
        lon2: Longitude of second point

    Returns:
        Distance in miles

    Example:
        >>> distance = haversine_distance_miles(41.476, -81.786, 41.480, -81.790)
        >>> # Returns distance in miles between two Cleveland addresses
    """
    R = 3959  # Earth's radius in miles

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c
