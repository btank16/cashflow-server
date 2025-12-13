# Test Geocoding Lambda Function

Simple Lambda function to test the `geocoding.py` module functionality.

## Purpose

This function tests the OpenStreetMap Nominatim geocoding implementation in `propertyDataGather/functions/geocoding.py`.

## Input Format

```json
{
  "street": "1600 Amphitheatre Parkway",
  "city": "Mountain View",
  "state": "CA",
  "zip": "94043"
}
```

### Required Fields

- `street`: Street address
- `city`: City name
- `state`: State abbreviation

### Optional Fields

- `zip`: ZIP code (recommended for better accuracy)

## Output Format

### Success Response

```json
{
  "success": true,
  "data": {
    "latitude": 37.4224764,
    "longitude": -122.0842499,
    "display_name": "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
    "address_details": {
      "house_number": "1600",
      "road": "Amphitheatre Parkway",
      "city": "Mountain View",
      "state": "California",
      "postcode": "94043",
      "country": "United States"
    }
  },
  "metadata": {
    "source": "nominatim",
    "query": "1600 Amphitheatre Parkway, Mountain View, CA, 94043, USA",
    "place_id": "123456",
    "osm_type": "way",
    "osm_id": "789012"
  },
  "execution_time_ms": 1234
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "No results found for address: ...",
    "code": "NOT_FOUND"
  }
}
```

## Error Codes

- `VALIDATION_ERROR`: Missing required fields
- `NOT_FOUND`: Address not found
- `TIMEOUT_ERROR`: Geocoding request timed out
- `EXTERNAL_API_ERROR`: Nominatim service unavailable
- `DATA_VALIDATION_ERROR`: Unexpected error during geocoding
- `HANDLER_ERROR`: Lambda handler error

## Test Examples

### Valid US Address

```json
{
  "street": "350 Fifth Avenue",
  "city": "New York",
  "state": "NY",
  "zip": "10118"
}
```

### Address Without ZIP

```json
{
  "street": "1 Apple Park Way",
  "city": "Cupertino",
  "state": "CA"
}
```

### Invalid Address (Should Return NOT_FOUND)

```json
{
  "street": "123 Fake Street",
  "city": "Nowhere",
  "state": "XX",
  "zip": "00000"
}
```

## Rate Limiting

The geocoding function uses GeoPy's RateLimiter to enforce Nominatim's usage policy:

- Maximum 1 request per second
- Automatic retry on rate limit errors
- 10 second timeout per request

## Notes

- The function uses OpenStreetMap's Nominatim service (free, no API key required)
- Results are limited to US addresses (`countrycodes='us'`)
- The geocoder instance is cached globally for consistent rate limiting
- All requests include a custom User-Agent as required by Nominatim policy

  {
  "osm_boundary_test": true,
  "target_address": {
  "street": "2092 W 101st St",
  "city": "Cleveland",
  "state": "OH",
  "zip": "44102"
  },
  "test_addresses": [
  {"street": "2142 W 105th St", "city": "Cleveland", "state": "OH", "zip": "44102"},
  {"street": "2173 W 106th St", "city": "Cleveland", "state": "OH", "zip": "44102"},
  {"street": "2182 West Blvd", "city": "Cleveland", "state": "OH", "zip": "44102"},
  {"street": "2179 West 106th Street", "city": "Cleveland", "state": "OH", "zip": "44102"},
  {"street": "1345 W 87th St", "city": "Cleveland", "state": "OH", "zip": "44102"},
  {"street": "1591 W 116th St", "city": "Cleveland", "state": "OH", "zip": "44102"}
  ]
  }
