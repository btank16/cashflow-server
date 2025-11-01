# Rental Workflow Lambda Function

Python-based orchestration workflow for gathering comprehensive rental property data.

## Overview

The Rental Workflow orchestrates multiple property data gathering functions in an optimized execution flow to collect all necessary information for rental property analysis.

## Workflow Phases

### Phase 1: Property Identification
1. **County Lookup** (Sequential)
   - Gets county name for the city/state
   - Required for property details lookup

2. **Parallel Property Discovery** (if county lookup succeeds)
   - **Property Details**: Gets units, square footage, beds, baths
   - **Neighborhood Lookup** (only if city is a metro area): Gets neighborhood name

### Phase 2: Market Research (only if property details succeeds)
All executed in parallel:
1. **Zillow ZIP Search**: Recent sold homes in the ZIP code via Apify
2. **Interest Rate**: Current mortgage rates for the state
3. **Property Tax**: Property tax information
4. **Apartment Comps**: Rental comparables for each unique bed/bath combination

## Input Format

```json
{
  "street": "123 Main St",
  "city": "Columbus",
  "state": "Ohio",
  "zip": "43215"
}
```

### Optional Configuration
```json
{
  "street": "123 Main St",
  "city": "Columbus",
  "state": "Ohio",
  "zip": "43215",
  "config": {
    "default_down_payment": 20,
    "default_loan_type": "30-year fixed",
    "max_zillow_results": 50,
    "zillow_days_back": "30"
  }
}
```

## Output Format

```json
{
  "success": true,
  "completedSteps": ["county", "neighborhood", "propertyInfo", "zillowSearch", "interestRate", "propertyTax", "apartmentComp_2bd_1ba"],
  "failedSteps": [],
  "skippedSteps": ["neighborhood"],
  "data": {
    "address": {
      "street": "123 Main St",
      "city": "Columbus",
      "state": "Ohio",
      "zip": "43215"
    },
    "county": {
      "county_name": "Franklin"
    },
    "neighborhood": {
      "neighborhood": "Short North"
    },
    "propertyInfo": {
      "total_units": 2,
      "total_sq_ft": 2000,
      "total_beds": 4,
      "total_bath": 2,
      "unit_sq_ft": [1000, 1000],
      "unit_bed": [2, 2],
      "unit_bath": [1, 1]
    },
    "zillowComps": { /* Zillow search results */ },
    "interestRate": {
      "interest_rate": 6.5
    },
    "propertyTax": {
      "annual_taxes": 3500
    },
    "apartmentComps": {
      "2bd_1ba": {
        "addresses": ["456 Oak St, Columbus, OH 43215", ...]
      }
    }
  },
  "metadata": {
    "totalApiCalls": 8,
    "totalExecutionTime": 45000,
    "workflowStartTime": "2025-01-15T10:30:00.000Z",
    "workflowEndTime": "2025-01-15T10:30:45.000Z",
    "isMetroArea": true,
    "stepDetails": [ /* Individual step results */ ]
  },
  "errors": []
}
```

## Features

### Partial Success Support
The workflow returns `success: true` if ANY steps complete successfully, even if some fail. This allows downstream processing to use whatever data was successfully gathered.

### Metro Area Detection
The workflow automatically detects if a city is in the Ohio metro area dataset and:
- Skips neighborhood lookup for non-metro cities
- Executes neighborhood lookup in parallel with property details for metro cities

### Error Handling
- Each step has independent error handling
- Failed steps don't prevent other steps from executing
- All errors are captured in the `errors` array with step name and error code

### Parallel Execution
- Phase 1: Property details and neighborhood (if metro) run in parallel after county lookup
- Phase 2: All market research functions run in parallel
- Uses Python asyncio for efficient I/O-bound operations

## Dependencies

- `perplexityai==0.19.1`: Perplexity AI API client
- `apify-client==2.2.1`: Apify web scraping client
- `pydantic==2.12.3`: Data validation
- `python-dotenv==1.2.1`: Environment variable management
- `tenacity==9.1.2`: Retry logic
- `typing-extensions==4.15.0`: Type hints
- `boto3==1.35.89`: AWS SDK for SSM parameter retrieval

## Environment Variables

Required:
- `PERPLEXITY_PARAM_NAME`: SSM parameter name for Perplexity API key (e.g., `/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI`)
- `APIFY_PARAM_NAME`: SSM parameter name for Apify API key (e.g., `/amplify/shared/d1yieg8lf5bsxx/ApifyAPI`)

The Lambda function uses the centralized `get_api_clients_from_env()` utility from `propertyDataGather.common` to:
1. Read SSM parameter names from environment variables
2. Retrieve and decrypt actual API keys from AWS Systems Manager Parameter Store at runtime
3. Initialize and return ready-to-use PerplexityClient and ApifyClient instances

This approach:
- Avoids AWS Secrets Manager costs ($0.80/month per secret)
- Uses existing Amplify secrets stored as SSM SecureString parameters
- Provides in-memory caching to reduce SSM API calls
- Centralizes secrets management across all Python Lambda functions

## Configuration

- **Runtime**: Python 3.12
- **Memory**: 512 MB
- **Timeout**: 180 seconds (3 minutes)
- **Architecture**: arm64

## Metro Area Cities

The following Ohio cities are recognized as metro areas:
- Columbus
- Cleveland
- Cincinnati
- Dayton
- Akron
- Toledo
- Canton
- Youngstown
- Parma
- Lorain

Non-metro cities will skip the neighborhood lookup step.

## Usage Example

```python
# Direct function invocation (for testing)
from handler import handler

event = {
    "street": "123 Main St",
    "city": "Columbus",
    "state": "Ohio",
    "zip": "43215"
}

result = handler(event, None)
print(result['success'])
print(result['completedSteps'])
```

## Error Codes

- `VALIDATION_ERROR`: Missing required input fields
- `CONFIG_ERROR`: Missing API keys
- `EXECUTION_ERROR`: Error during step execution
- `SKIPPED`: Step was intentionally skipped (e.g., non-metro city)
- `WORKFLOW_ERROR`: Catastrophic workflow failure
- `HANDLER_ERROR`: Lambda handler error

## Performance

Typical execution times:
- Full successful workflow: 40-60 seconds
- Phase 1 only: 15-25 seconds
- Individual step: 3-8 seconds

Total API calls: 7-12 depending on number of unique bed/bath combinations

## Development

To test locally:
```bash
# Install dependencies
cd amplify/functions/rentalWorkflow
pip install -r requirements.txt

# Set environment variables with SSM parameter names
export PERPLEXITY_PARAM_NAME="/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI"
export APIFY_PARAM_NAME="/amplify/shared/d1yieg8lf5bsxx/ApifyAPI"

# Ensure AWS credentials are configured for SSM access
# aws configure

# Run handler
python -c "from handler import handler; print(handler({'street': '123 Main St', 'city': 'Columbus', 'state': 'Ohio', 'zip': '43215'}, None))"
```

Note: Local testing requires:
- Valid AWS credentials with SSM read permissions
- Access to the SSM parameters in your AWS account
- The `boto3` package installed

## Architecture

```
handler.py
    ↓
orchestrator.py
    ↓
┌─────────────────────────────┐
│  Phase 1: Sequential       │
│  County Lookup             │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  Phase 1: Parallel         │
│  Property Details           │
│  Neighborhood (if metro)    │
└──────────┬──────────────────┘
           ↓
┌─────────────────────────────┐
│  Phase 2: All Parallel     │
│  Zillow Search              │
│  Interest Rate              │
│  Property Tax               │
│  Apartment Comps (per unit) │
└─────────────────────────────┘
```

## Related Functions

This workflow orchestrates the following functions from `/propertyDataGather`:
- `get_county_name`
- `get_neighborhood_name`
- `get_initial_property_info`
- `get_property_tax`
- `get_interest_rate`
- `get_apartment_comps`
- `search_zillow_by_zip`
- `is_valid_city`
