# propertyDataGather

Python module containing 40+ functions for gathering and analyzing real estate property data. This module is consumed by the `newRentalWorkflow` Lambda function.

## Module Structure

```
propertyDataGather/
  common/                  # Shared infrastructure
    types.py               # Core data models (FunctionResult, ErrorCode, Address, FunctionMetadata)
    utils.py               # Validation, response builders, retry decorator, execution timing
    aws_clients.py         # SSM Parameter Store integration, API client initialization
    base_ai_client.py      # Abstract base class for AI clients
    perplexity_client.py   # Perplexity AI wrapper (web search + structured output)
    gemini_client.py       # Google Gemini wrapper (structured output + search grounding)
    rentcast_client.py     # Rentcast HTTP wrapper (property data API)
    distributed_rate_limiter.py  # DynamoDB-backed rate limiting across Lambda instances
    osm_config.py          # OpenStreetMap bounding box calculations and config
    logging_utils.py       # Structured logging for workflows
  functions/               # Feature functions
    __init__.py            # Exports all function handlers
    geocoding.py           # Address validation + coordinate lookup
    boundary_builder.py    # Polygon construction from OSM ways
    osm_fetcher.py         # OpenStreetMap Overpass API queries
    address_checker.py     # Point-in-polygon boundary containment
    property_details.py    # Property info via Perplexity
    gemini_property_details.py  # Property info via Gemini + Google Search
    property_tax.py        # Property tax lookup
    comparable_sales.py    # Sale comps via Perplexity
    gemini_property_sales.py    # Recent sales via Gemini + Google Search
    recent_sales.py        # Recent sale info lookup
    gemini_apartment_comps.py   # Apartment rental comps via Gemini
    rentcast_data.py       # Rentcast API integration (records, listings, stats)
    interest_rates.py      # Mortgage rate lookup and adjustment
    similar_areas.py       # Similar neighborhood identification
    median_analysis.py     # Five-number summary and IQR outlier filtering
```

## Core Patterns

### FunctionResult

Every function returns a `FunctionResult[T]` — a standardized response wrapper:

```python
class FunctionResult(BaseModel, Generic[T]):
    success: bool
    data: Optional[T]
    error: Optional[str]
    error_code: Optional[ErrorCode]
    metadata: Optional[FunctionMetadata]
```

This ensures consistent error handling and metadata tracking across all functions.

### ErrorCode

Standardized error codes for client-side handling:

| Code | When Used |
|------|-----------|
| `VALIDATION_ERROR` | Missing/invalid input fields |
| `API_ERROR` | External API call failure |
| `RATE_LIMIT_ERROR` | API rate limit exceeded |
| `TIMEOUT_ERROR` | API call timed out |
| `NO_DATA` | API returned no results |
| `DEPENDENCY_FAILED` | Required upstream step failed |
| `CONFIG_ERROR` | Missing API keys or configuration |
| `INTERNAL_ERROR` | Unexpected runtime error |

### FunctionMetadata

Tracks execution metrics per function call:

```python
class FunctionMetadata(BaseModel):
    api_calls: int
    execution_time: float        # seconds
    model: Optional[str]         # AI model used
    search_domains: List[str]    # Web search domains queried
    source: Optional[str]        # Data source identifier
    result_count: Optional[int]  # Number of results returned
```

Metadata from multiple functions can be merged via `FunctionMetadata.merge()`.

## API Clients

### Perplexity (`perplexity_client.py`)
- Web search with optional domain filtering (e.g., freddiemac.com, bankrate.com)
- Structured JSON output via response schema
- Model: `sonar` (default)
- Retry with configurable max_retries and timeout

### Gemini (`gemini_client.py`)
- Structured output via JSON schema
- Google Search grounding for real-time data
- Thinking levels (`low`/`high`) for Gemini 3 Pro models
- Model: `gemini-pro-latest` (default)

### Rentcast (`rentcast_client.py`)
- REST API wrapper for property records, rental/sale listings, market stats
- Rate limited to 20 req/sec via distributed DynamoDB-backed limiter
- API key passed via `X-Api-Key` header

### Initialization

All clients are initialized in `aws_clients.py` via `get_all_api_clients_from_env()`:
1. Reads API keys from SSM Parameter Store (encrypted, 5-min cache via Lambda Powertools)
2. Returns an `APIClients` named tuple with `perplexity`, `gemini`, and `rentcast` clients

## Function Categories

### Geocoding and Boundaries
| Function | Source | Purpose |
|----------|--------|---------|
| `get_coordinates()` | Google Address Validation + AWS Geo-Places | Validate address and get lat/lon |
| `batch_geocode_addresses()` | Google/AWS | Parallel geocoding of multiple addresses |
| `osm_fetcher` | OpenStreetMap Overpass | Fetch boundary ways for an area |
| `boundary_builder` | Shapely + networkx | Build polygon from OSM ways, expand through soft boundaries |
| `address_checker` | Shapely | Test if coordinates fall within a polygon |

### Property Information
| Function | Source | Purpose |
|----------|--------|---------|
| `get_initial_property_info()` | Perplexity | Basic property details (beds, baths, sqft) |
| `get_initial_property_info()` (gemini) | Gemini + Google Search | Property details with search grounding |
| `get_property_tax()` | Perplexity | Annual property tax lookup |
| `get_recent_sale_info()` | Perplexity | Last sale date and price |

### Comparable Data
| Function | Source | Purpose |
|----------|--------|---------|
| `get_comparable_sales()` | Perplexity | Sale comps via web search |
| `get_gemini_property_sales()` | Gemini + Google Search | Recent sales with search grounding |
| `get_gemini_apartment_comps()` | Gemini + Google Search | Apartment rental comps |
| `get_rentcast_*()` | Rentcast API | Property records, rental/sale listings, market stats |

### Analysis
| Function | Source | Purpose |
|----------|--------|---------|
| `get_interest_rate()` | Perplexity | Current mortgage rate lookup |
| `adjust_interest_rate()` | Local calculation | Rate adjustments for property type and down payment |
| `get_similar_areas()` | Perplexity | Find comparable neighborhoods |
| `calculate_five_number_summary()` | Local calculation | Statistical analysis with IQR outlier filtering |

## Rate Limiting

The module uses a distributed rate limiter (`distributed_rate_limiter.py`) backed by DynamoDB to coordinate rate limits across concurrent Lambda invocations:

- **Rentcast**: 20 requests/second enforced proactively
- **Overpass API**: Rate-limited to avoid OSM throttling
- **Geocoding**: Coordinated via DynamoDB to prevent Google API quota exhaustion

## Adding a New Function

1. Create a new file in `functions/`
2. Define Pydantic input/output models
3. Implement the function returning `FunctionResult[YourOutput]`
4. Use `create_success_response()` / `create_error_response()` from `common/utils.py`
5. Apply `@retry_with_backoff` and `@measure_execution_time` decorators as needed
6. Export from `functions/__init__.py`
7. Wire into the orchestrator in `newRentalWorkflow/orchestrator.py`
