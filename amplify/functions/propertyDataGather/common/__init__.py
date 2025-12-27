"""Common utilities for propertyDataGather functions."""

from .types import (
    ErrorCode,
    FunctionMetadata,
    FunctionResult,
    Address
)
from .utils import (
    validate_input,
    create_error_response,
    create_success_response,
    retry_with_backoff,
    measure_execution_time,
    combine_metadata,
    is_success,
    extract_data
)
from .perplexity_client import PerplexityClient, PerplexityRequest
from .rentcast_client import RentcastClient
from .gemini_client import GeminiClient, GeminiRequest
from .base_ai_client import BaseAIClient
from .aws_clients import (
    get_all_api_clients_from_env,
    APIClients
)
from .rate_limiter import (
    RateLimiter,
    MultiServiceRateLimiter,
    get_nominatim_limiter,
    get_rentcast_limiter,
    reset_all_limiters
)
from .distributed_rate_limiter import (
    DistributedRateLimiter,
    RateLimitService,
    RateLimitConfig,
    RATE_LIMIT_CONFIGS,
    DistributedRateLimitError,
    get_distributed_limiter,
    acquire_rate_limit,
    try_acquire_rate_limit,
    reset_distributed_limiter
)
from .logging_utils import (
    log_workflow_start,
    log_workflow_complete
)
from .perplexity_factory import (
    create_perplexity_function,
    build_address_prompt,
    build_location_prompt
)

__all__ = [
    # Core types
    'ErrorCode',
    'FunctionMetadata',
    'FunctionResult',
    'Address',
    # Utility functions
    'validate_input',
    'create_error_response',
    'create_success_response',
    'retry_with_backoff',
    'measure_execution_time',
    'combine_metadata',
    'is_success',
    'extract_data',
    # Clients
    'PerplexityClient',
    'PerplexityRequest',
    'RentcastClient',
    'GeminiClient',
    'GeminiRequest',
    'BaseAIClient',
    # AWS utilities
    'get_all_api_clients_from_env',
    'APIClients',
    # Rate limiting (local - per Lambda instance)
    'RateLimiter',
    'MultiServiceRateLimiter',
    'get_nominatim_limiter',
    'get_rentcast_limiter',
    'reset_all_limiters',
    # Rate limiting (distributed - across Lambda instances via DynamoDB)
    'DistributedRateLimiter',
    'RateLimitService',
    'RateLimitConfig',
    'RATE_LIMIT_CONFIGS',
    'DistributedRateLimitError',
    'get_distributed_limiter',
    'acquire_rate_limit',
    'try_acquire_rate_limit',
    'reset_distributed_limiter',
    # Logging utilities
    'log_workflow_start',
    'log_workflow_complete',
    # Perplexity factory
    'create_perplexity_function',
    'build_address_prompt',
    'build_location_prompt',
]
