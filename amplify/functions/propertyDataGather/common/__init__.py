"""Common utilities for propertyDataGather functions."""

from .types import (
    ErrorCode,
    FunctionMetadata,
    FunctionResult,
    Address,
    ExtendedAddress
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
    AWSSecretsManager,
    get_ssm_parameter,
    get_perplexity_client_from_env,
    get_gemini_client_from_env,
    get_rentcast_client_from_env,
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
from .logging_utils import (
    mask_pii,
    hash_for_correlation,
    sanitize_for_logging,
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
    'ExtendedAddress',
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
    'AWSSecretsManager',
    'get_ssm_parameter',
    'get_perplexity_client_from_env',
    'get_gemini_client_from_env',
    'get_rentcast_client_from_env',
    'get_all_api_clients_from_env',
    'APIClients',
    # Rate limiting
    'RateLimiter',
    'MultiServiceRateLimiter',
    'get_nominatim_limiter',
    'get_rentcast_limiter',
    'reset_all_limiters',
    # Logging utilities
    'mask_pii',
    'hash_for_correlation',
    'sanitize_for_logging',
    'log_workflow_start',
    'log_workflow_complete',
    # Perplexity factory
    'create_perplexity_function',
    'build_address_prompt',
    'build_location_prompt',
]
