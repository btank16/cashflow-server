"""AWS service client wrappers for Lambda functions."""

import os
import logging
from typing import Optional, Dict, Tuple, Any

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


def get_api_clients_from_env(
    perplexity_env_var: str = 'PERPLEXITY_PARAM_NAME',
    apify_env_var: str = 'APIFY_PARAM_NAME'
) -> Tuple[Any, Any]:
    """
    Convenience function to retrieve API clients from environment variables.

    Reads SSM parameter names from environment variables, retrieves the
    actual API keys from SSM, and returns initialized API clients.

    Args:
        perplexity_env_var: Environment variable containing Perplexity SSM parameter name
        apify_env_var: Environment variable containing Apify SSM parameter name

    Returns:
        Tuple of (PerplexityClient, ApifyClient)

    Raises:
        ValueError: If environment variables are not set
        Exception: If parameters cannot be retrieved from SSM

    Example:
        >>> perplexity_client, apify_client = get_api_clients_from_env()
    """
    # Import here to avoid circular dependencies
    from .perplexity_client import PerplexityClient
    from apify_client import ApifyClient

    # Get parameter names from environment
    perplexity_param_name = os.environ.get(perplexity_env_var)
    apify_param_name = os.environ.get(apify_env_var)

    if not perplexity_param_name or not apify_param_name:
        missing = []
        if not perplexity_param_name:
            missing.append(perplexity_env_var)
        if not apify_param_name:
            missing.append(apify_env_var)
        raise ValueError(f'Missing required environment variables: {", ".join(missing)}')

    # Retrieve API keys from SSM
    secrets_manager = AWSSecretsManager()
    params = secrets_manager.get_multiple_parameters([
        perplexity_param_name,
        apify_param_name
    ])

    perplexity_api_key = params.get(perplexity_param_name)
    apify_api_key = params.get(apify_param_name)

    if not perplexity_api_key or not apify_api_key:
        raise ValueError('Failed to retrieve API keys from SSM')

    # Initialize and return clients
    perplexity_client = PerplexityClient(perplexity_api_key)
    apify_client = ApifyClient(apify_api_key)

    logger.info('Successfully initialized API clients from SSM parameters')
    return perplexity_client, apify_client
