"""AWS service client wrappers for Lambda functions."""

import os
import logging
from typing import Dict, Any, Optional, NamedTuple

try:
    # In Lambda runtime, boto3 is pre-installed
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    # For local development, boto3 needs to be installed
    import sys
    print("Warning: boto3 not found. Install it for local testing: pip install boto3", file=sys.stderr)
    raise

logger = logging.getLogger(__name__)


class AWSSecretsManager:
    """
    Manages AWS SSM Parameter Store access for Lambda functions.

    Provides centralized secret retrieval with optional caching to reduce
    SSM API calls and improve performance.
    """

    def __init__(self, use_cache: bool = True):
        """
        Initialize AWS Secrets Manager.

        Args:
            use_cache: Enable in-memory caching of retrieved parameters (default: True)
        """
        self.ssm_client = boto3.client('ssm')
        self.use_cache = use_cache
        self._cache: Dict[str, str] = {}

    def get_parameter(
        self,
        parameter_name: str,
        with_decryption: bool = True
    ) -> str:
        """
        Retrieve a parameter from AWS Systems Manager Parameter Store.

        Args:
            parameter_name: The name/path of the parameter to retrieve
            with_decryption: Decrypt SecureString parameters (default: True)

        Returns:
            The parameter value

        Raises:
            ClientError: If parameter cannot be retrieved from SSM
            Exception: For other retrieval errors
        """
        # Check cache first
        if self.use_cache and parameter_name in self._cache:
            logger.debug(f'Retrieved parameter {parameter_name} from cache')
            return self._cache[parameter_name]

        try:
            logger.info(f'Retrieving parameter {parameter_name} from SSM')
            response = self.ssm_client.get_parameter(
                Name=parameter_name,
                WithDecryption=with_decryption
            )

            value = response['Parameter']['Value']

            # Cache the value
            if self.use_cache:
                self._cache[parameter_name] = value

            return value

        except ClientError as error:
            error_code = error.response['Error']['Code']
            logger.error(f'Failed to retrieve SSM parameter {parameter_name}: {error_code}')
            raise
        except Exception as error:
            logger.error(f'Unexpected error retrieving SSM parameter {parameter_name}: {error}')
            raise

    def get_multiple_parameters(
        self,
        parameter_names: list[str],
        with_decryption: bool = True
    ) -> Dict[str, str]:
        """
        Retrieve multiple parameters from SSM in a single API call.

        More efficient than multiple get_parameter() calls when retrieving
        several parameters at once.

        Args:
            parameter_names: List of parameter names to retrieve
            with_decryption: Decrypt SecureString parameters (default: True)

        Returns:
            Dictionary mapping parameter names to their values

        Raises:
            ClientError: If parameters cannot be retrieved from SSM
        """
        # Filter out None values
        parameter_names = [p for p in parameter_names if p is not None]

        if not parameter_names:
            return {}

        # Check cache for all parameters
        if self.use_cache:
            uncached_params = [p for p in parameter_names if p not in self._cache]
            if not uncached_params:
                logger.debug('Retrieved all parameters from cache')
                return {name: self._cache[name] for name in parameter_names}

            # Retrieve only uncached parameters
            params_to_fetch = uncached_params
        else:
            params_to_fetch = parameter_names

        try:
            logger.info(f'Retrieving {len(params_to_fetch)} parameters from SSM')
            response = self.ssm_client.get_parameters(
                Names=params_to_fetch,
                WithDecryption=with_decryption
            )

            # Build result dictionary
            result = {}
            for param in response['Parameters']:
                value = param['Value']
                name = param['Name']
                result[name] = value

                # Cache the value
                if self.use_cache:
                    self._cache[name] = value

            # Add cached values if any
            if self.use_cache:
                for name in parameter_names:
                    if name in self._cache and name not in result:
                        result[name] = self._cache[name]

            # Check for missing parameters
            if len(result) != len(parameter_names):
                missing = set(parameter_names) - set(result.keys())
                logger.warning(f'Some parameters were not found: {missing}')

            return result

        except ClientError as error:
            error_code = error.response['Error']['Code']
            logger.error(f'Failed to retrieve SSM parameters: {error_code}')
            raise

    def clear_cache(self) -> None:
        """Clear the parameter cache."""
        self._cache.clear()
        logger.debug('Parameter cache cleared')


def get_ssm_parameter(parameter_name: str, with_decryption: bool = True) -> str:
    """
    Convenience function to retrieve a single SSM parameter.

    Args:
        parameter_name: The name/path of the parameter to retrieve
        with_decryption: Decrypt SecureString parameters (default: True)

    Returns:
        The parameter value

    Raises:
        Exception: If parameter cannot be retrieved

    Example:
        >>> api_key = get_ssm_parameter('/amplify/shared/app123/ApiKey')
    """
    secrets_manager = AWSSecretsManager()
    return secrets_manager.get_parameter(parameter_name, with_decryption)


def get_perplexity_client_from_env(
    perplexity_env_var: str = 'PERPLEXITY_PARAM_NAME'
) -> Any:
    """
    Retrieve Perplexity client from SSM.

    Args:
        perplexity_env_var: Environment variable containing Perplexity SSM parameter name

    Returns:
        PerplexityClient instance

    Raises:
        ValueError: If environment variable not set or API key not found
        Exception: If parameter cannot be retrieved from SSM
    """
    from .perplexity_client import PerplexityClient

    perplexity_param_name = os.environ.get(perplexity_env_var)
    if not perplexity_param_name:
        raise ValueError(f'Missing required environment variable: {perplexity_env_var}')

    secrets_manager = AWSSecretsManager()
    perplexity_api_key = secrets_manager.get_parameter(perplexity_param_name)

    if not perplexity_api_key:
        raise ValueError('Failed to retrieve Perplexity API key from SSM')

    logger.info(f'Successfully initialized Perplexity client from SSM parameter: {perplexity_param_name}')
    return PerplexityClient(perplexity_api_key)


def get_gemini_client_from_env(
    gemini_env_var: str = 'GEMINI_PARAM_NAME',
    default_param_name: str = 'GeminiAPI'
) -> Any:
    """
    Convenience function to retrieve Gemini client from SSM.

    Args:
        gemini_env_var: Environment variable containing Gemini SSM parameter name
        default_param_name: Default SSM parameter name if env var not set

    Returns:
        GeminiClient instance

    Raises:
        ValueError: If API key cannot be retrieved
        Exception: If parameter cannot be retrieved from SSM
    """
    from .gemini_client import GeminiClient

    gemini_param_name = os.environ.get(gemini_env_var, default_param_name)
    secrets_manager = AWSSecretsManager()
    gemini_api_key = secrets_manager.get_parameter(gemini_param_name)

    if not gemini_api_key:
        raise ValueError('Failed to retrieve Gemini API key from SSM')

    logger.info(f'Successfully initialized Gemini client from SSM parameter: {gemini_param_name}')
    return GeminiClient(gemini_api_key)


def get_rentcast_client_from_env(
    rentcast_env_var: str = 'RENTCAST_PARAM_NAME',
    default_param_name: str = 'RentCastAPI'
) -> Any:
    """
    Convenience function to retrieve Rentcast client from SSM.

    Args:
        rentcast_env_var: Environment variable containing Rentcast SSM parameter name
        default_param_name: Default SSM parameter name if env var not set

    Returns:
        RentcastClient instance

    Raises:
        ValueError: If API key cannot be retrieved
        Exception: If parameter cannot be retrieved from SSM
    """
    from .rentcast_client import RentcastClient

    rentcast_param_name = os.environ.get(rentcast_env_var, default_param_name)
    secrets_manager = AWSSecretsManager()
    rentcast_api_key = secrets_manager.get_parameter(rentcast_param_name)

    if not rentcast_api_key:
        raise ValueError('Failed to retrieve Rentcast API key from SSM')

    logger.info(f'Successfully initialized Rentcast client from SSM parameter: {rentcast_param_name}')
    return RentcastClient(rentcast_api_key)


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
    Retrieve all API clients from environment variables in a single batch.

    This is the recommended function for retrieving API clients as it:
    - Batches SSM parameter retrieval into a single API call
    - Returns all clients in a typed NamedTuple
    - Uses consistent environment variable patterns

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
        Exception: If parameters cannot be retrieved from SSM

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

    # Batch retrieve all API keys from SSM
    secrets_manager = AWSSecretsManager()
    params = secrets_manager.get_multiple_parameters([
        perplexity_param,
        gemini_param,
        rentcast_param
    ])

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
