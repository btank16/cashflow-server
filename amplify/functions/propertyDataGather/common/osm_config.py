"""Configuration for OpenStreetMap way types and Overpass API queries."""

import math
from typing import Dict, List, Any

# Radius configuration
MILES_TO_DEGREES_LAT = 0.0144927536  # 1 mile ≈ 0.0145 degrees latitude
DEFAULT_RADIUS_MILES = 2.0

# OSM Way Types - All treated with equal priority
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


def check_bbox_intersection(bbox1: List[float], bbox2: List[float]) -> Dict[str, Any]:
    """
    Check if two bounding boxes intersect and calculate overlap.

    Args:
        bbox1: [min_lat, max_lat, min_lon, max_lon]
        bbox2: [min_lat, max_lat, min_lon, max_lon]

    Returns:
        {
            'intersects': bool,
            'radius_crosses_zip': bool,
            'overlap_area_sq_degrees': float
        }

    Example:
        >>> radius_bbox = [41.46, 41.49, -81.80, -81.77]
        >>> zip_bbox = [41.45, 41.52, -81.85, -81.75]
        >>> result = check_bbox_intersection(radius_bbox, zip_bbox)
        >>> result['radius_crosses_zip']  # True if radius extends beyond zip
    """
    min_lat1, max_lat1, min_lon1, max_lon1 = bbox1
    min_lat2, max_lat2, min_lon2, max_lon2 = bbox2

    # Check if bboxes overlap
    intersects = not (
        max_lat1 < min_lat2 or max_lat2 < min_lat1 or
        max_lon1 < min_lon2 or max_lon2 < min_lon1
    )

    # Check if bbox1 extends beyond bbox2 boundaries (radius crosses zip)
    crosses = (
        min_lat1 < min_lat2 or max_lat1 > max_lat2 or
        min_lon1 < min_lon2 or max_lon1 > max_lon2
    )

    # Calculate overlap area if intersects
    overlap_area = 0.0
    if intersects:
        overlap_min_lat = max(min_lat1, min_lat2)
        overlap_max_lat = min(max_lat1, max_lat2)
        overlap_min_lon = max(min_lon1, min_lon2)
        overlap_max_lon = min(max_lon1, max_lon2)

        overlap_area = (overlap_max_lat - overlap_min_lat) * (overlap_max_lon - overlap_min_lon)

    return {
        'intersects': intersects,
        'radius_crosses_zip': crosses,
        'overlap_area_sq_degrees': overlap_area
    }
