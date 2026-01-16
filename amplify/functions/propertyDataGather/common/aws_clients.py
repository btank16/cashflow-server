"""AWS service client wrappers for Lambda functions.

Uses AWS Lambda Powertools for parameter retrieval from SSM Parameter Store.
The Powertools layer provides built-in caching, decryption, and batch retrieval.
"""

import os
import logging
from typing import Any, NamedTuple

from aws_lambda_powertools.utilities import parameters

logger = logging.getLogger(__name__)


class APIClients(NamedTuple):
    """Container for all API clients."""
    perplexity: Any
    gemini: Any
    rentcast: Any


def get_all_api_clients_from_env(
    perplexity_env_var: str = 'PERPLEXITY_PARAM_NAME',
    gemini_env_var: str = 'GEMINI_PARAM_NAME',
    rentcast_env_var: str = 'RENTCAST_PARAM_NAME',
    default_gemini_param: str = 'GeminiAPI',
    default_rentcast_param: str = 'RentCastAPI'
) -> APIClients:
    """
    Retrieve all API clients from SSM Parameter Store using Lambda Powertools.

    Uses batch retrieval with automatic caching (5 min TTL) and decryption.

    Args:
        perplexity_env_var: Environment variable for Perplexity SSM parameter name
        gemini_env_var: Environment variable for Gemini SSM parameter name
        rentcast_env_var: Environment variable for Rentcast SSM parameter name
        default_gemini_param: Default SSM parameter name for Gemini if env var not set
        default_rentcast_param: Default SSM parameter name for Rentcast if env var not set

    Returns:
        APIClients NamedTuple with (perplexity, gemini, rentcast) clients

    Raises:
        ValueError: If required environment variables are not set or API keys not found
        GetParameterError: If parameters cannot be retrieved from SSM

    Example:
        >>> clients = get_all_api_clients_from_env()
        >>> clients.perplexity.search("query")
        >>> clients.rentcast.get_property(address)
    """
    from .perplexity_client import PerplexityClient
    from .gemini_client import GeminiClient
    from .rentcast_client import RentcastClient

    # Get parameter names from environment
    perplexity_param = os.environ.get(perplexity_env_var)
    gemini_param = os.environ.get(gemini_env_var, default_gemini_param)
    rentcast_param = os.environ.get(rentcast_env_var, default_rentcast_param)

    # Validate required env vars
    if not perplexity_param:
        raise ValueError(f'Missing required environment variable: {perplexity_env_var}')

    # Batch retrieve all API keys from SSM using Powertools
    # - Automatic 5-minute caching (configurable via POWERTOOLS_PARAMETERS_MAX_AGE)
    # - Automatic decryption for SecureString parameters
    logger.info('Retrieving API keys from SSM Parameter Store')
    params = parameters.get_parameters_by_name(
        parameters={
            perplexity_param: {'decrypt': True},
            gemini_param: {'decrypt': True},
            rentcast_param: {'decrypt': True},
        },
        raise_on_error=True
    )

    # Extract API keys
    perplexity_key = params.get(perplexity_param)
    gemini_key = params.get(gemini_param)
    rentcast_key = params.get(rentcast_param)

    # Validate all keys were retrieved
    missing_keys = []
    if not perplexity_key:
        missing_keys.append('Perplexity')
    if not gemini_key:
        missing_keys.append('Gemini')
    if not rentcast_key:
        missing_keys.append('Rentcast')
    if missing_keys:
        raise ValueError(f'Failed to retrieve API keys from SSM: {", ".join(missing_keys)}')

    # Initialize all clients
    clients = APIClients(
        perplexity=PerplexityClient(perplexity_key),
        gemini=GeminiClient(gemini_key),
        rentcast=RentcastClient(rentcast_key)
    )

    logger.info('Successfully initialized all API clients from SSM parameters')
    return clients
