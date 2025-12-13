"""Metro area lookup - city validation for Ohio."""

from typing import Dict

# Flat map: City -> State code (Ohio cities only)
CITY_TO_STATE: Dict[str, str] = {
    "Columbus": "OH",
    "Cleveland": "OH",
    "Cincinnati": "OH",
    "Dayton": "OH",
    "Akron": "OH",
    "Toledo": "OH",
    "Canton": "OH",
    "Youngstown": "OH",
    "Parma": "OH",
    "Lorain": "OH",
}


def is_valid_city(city: str) -> bool:
    """Check if a city is valid (exists in our data)."""
    return city in CITY_TO_STATE
