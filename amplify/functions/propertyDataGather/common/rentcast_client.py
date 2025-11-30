"""Rentcast API client wrapper."""

from typing import Dict, Any, Optional
import requests
import logging
from .types import ErrorCode

logger = logging.getLogger(__name__)


class RentcastClient:
    """Wrapper for Rentcast API HTTP client."""

    def __init__(self, api_key: str, base_url: str = 'https://api.rentcast.io/v1', timeout: float = 30.0):
        """
        Initialize Rentcast client.

        Args:
            api_key: Rentcast API key
            base_url: Base URL for Rentcast API
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.api_calls = 0

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Make a GET request to Rentcast API.

        Args:
            path: API endpoint path (e.g., '/properties', '/markets')
            params: Query parameters

        Returns:
            Response data as dictionary

        Raises:
            requests.exceptions.HTTPError: For HTTP error responses
            requests.exceptions.Timeout: For timeout errors
            requests.exceptions.RequestException: For other request errors
        """
        url = f"{self.base_url}{path}"
        headers = {
            'X-Api-Key': self.api_key,
            'Accept': 'application/json'
        }

        try:
            self.api_calls += 1
            logger.info(f"Rentcast API request: GET {url} with params: {params}")

            response = requests.get(
                url,
                headers=headers,
                params=params,
                timeout=self.timeout
            )

            response.raise_for_status()
            return response.json()

        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code
            error_message = f"HTTP {status_code} error"

            try:
                error_data = e.response.json()
                if 'message' in error_data:
                    error_message = error_data['message']
            except Exception:
                pass

            logger.error(f"Rentcast API HTTP error: {status_code} - {error_message}")
            raise

        except requests.exceptions.Timeout as e:
            logger.error(f"Rentcast API timeout: {e}")
            raise

        except requests.exceptions.RequestException as e:
            logger.error(f"Rentcast API request error: {e}")
            raise
