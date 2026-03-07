# newRentalWorkflow

Multi-step property data gathering workflow that aggregates data from multiple external APIs to produce a comprehensive rental property analysis.

## Trigger

Invoked asynchronously by `startRentalWorkflow` via Lambda `InvocationType: 'Event'`. Can also be invoked synchronously for testing.

## Input

```json
{
  "arguments": {
    "street": "123 Main St",
    "city": "Cleveland",
    "state": "OH",
    "zip": "44102"
  },
  "jobId": "uuid-from-startRentalWorkflow",
  "userId": "cognito-user-id"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `street` | Yes | Street address |
| `city` | Yes | City name |
| `state` | Yes | State name or abbreviation |
| `zip` | Yes | 5-digit ZIP code |
| `jobId` | No | Job ID for async invocation (enables DynamoDB progress updates) |
| `userId` | No | User ID for async invocation |
| `config` | No | Configuration overrides for workflow behavior |

## Output

### Async mode (with jobId)
Updates the `WorkflowJob` DynamoDB table with progress and final results. Returns:
```json
{
  "success": true,
  "jobId": "uuid"
}
```

### Sync mode (GraphQL)
```json
{
  "success": true,
  "formattedOutput": { ... },
  "metadata": { ... },
  "error": null
}
```

The `formattedOutput` contains the full property analysis including geocoded address, boundary data, property info, tax data, sales comps, rental comps, and interest rate estimates.

## Workflow Steps

The orchestrator (`orchestrator.py`) runs steps in this order:

1. **Validation** - Geocode address via Google Address Validation API, verify property type is "house"
2. **Parallel execution** (via `ThreadPoolExecutor`):
   - **Boundary analysis** - Calculate bounding box, fetch OSM ways, build polygon, expand boundary
   - **Property data** - Fetch property info, tax data, sales comps, apartment comps (via Rentcast, Gemini, Perplexity)
3. **Post-processing** - Statistical analysis with 5-number summary and IQR outlier filtering

## Architecture

```
handler (index.py)
    |
    v
NewRentalWorkflowOrchestrator (orchestrator.py)
    |
    +---> propertyDataGather/common/    (API clients, types, utilities)
    +---> propertyDataGather/functions/ (40+ data-gathering functions)
    |
    +---> ThreadPoolExecutor (parallel API calls)
    |
    +---> DynamoDB updates (progress callbacks)
```

## Key Files

| File | Purpose |
|------|---------|
| `index.py` | Lambda handler, job status updates, invocation routing |
| `orchestrator.py` | `NewRentalWorkflowOrchestrator` class, step sequencing, parallel execution |
| `workflow_types.py` | `WorkflowConfig` and related type definitions |

## External APIs

| API | Purpose | Auth |
|-----|---------|------|
| Google Address Validation | Geocoding and address validation | SSM: `GOOGLE_MAPS_PARAM_NAME` |
| AWS Location Service v2 | Fallback geocoding | IAM role |
| OpenStreetMap Overpass | Boundary polygon data | Public (rate-limited) |
| Rentcast | Property records, rental/sale listings, market stats | SSM: `RENTCAST_PARAM_NAME` |
| Google Gemini | Property details, sales analysis, apartment comps | SSM: `GEMINI_PARAM_NAME` |
| Perplexity | Interest rates, comparable sales | SSM: `PERPLEXITY_PARAM_NAME` |

All API keys are retrieved from **SSM Parameter Store** via `aws_clients.py` with 5-minute caching.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WORKFLOW_JOB_TABLE_NAME` | DynamoDB table for job status updates |
| `GEMINI_PARAM_NAME` | SSM parameter name for Gemini API key |
| `PERPLEXITY_PARAM_NAME` | SSM parameter name for Perplexity API key |
| `RENTCAST_PARAM_NAME` | SSM parameter name for Rentcast API key |
| `GOOGLE_MAPS_PARAM_NAME` | SSM parameter name for Google Maps API key |
| `RATE_LIMIT_TABLE_NAME` | DynamoDB table for distributed rate limiting |

## Dependencies

- Python 3.x with Pydantic, Shapely, networkx, tenacity, requests
- AWS SDK (boto3) for DynamoDB and Lambda Powertools for SSM
- See `propertyDataGather/` for full module documentation

## Error Handling

- Each sub-function returns `FunctionResult` with success/error status and error codes
- The orchestrator continues on non-critical failures and reports partial results
- Failed steps are logged in `metadata.failed_steps`
- For async jobs, errors are written to the `WorkflowJob` DynamoDB record
