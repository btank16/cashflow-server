"""Configuration for OpenStreetMap way types and Overpass API queries."""

from typing import Dict, List

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
