"""Rate limiter implementation for external API compliance."""

import time
import logging
from threading import Lock
from typing import Optional

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Thread-safe rate limiter for API request throttling.

    This implementation uses a simple time-based approach suitable for
    Lambda environments where rate limiting is per-invocation.

    For distributed rate limiting across multiple Lambda invocations,
    consider using DynamoDB or ElastiCache.

    Example:
        limiter = RateLimiter(min_interval=1.0)  # 1 request per second

        def make_api_call():
            limiter.wait()  # Blocks if needed
            return requests.get(url)
    """

    def __init__(self, min_interval: float = 1.0, name: str = 'default'):
        """
        Initialize the rate limiter.

        Args:
            min_interval: Minimum seconds between requests
            name: Name for logging purposes
        """
        self.min_interval = min_interval
        self.name = name
        self._last_request_time: float = 0.0
        self._lock = Lock()
        self._request_count = 0

    def wait(self) -> float:
        """
        Wait if needed to respect rate limit.

        Returns:
            Actual wait time in seconds (0 if no wait needed)
        """
        with self._lock:
            current_time = time.time()
            elapsed = current_time - self._last_request_time
            wait_time = 0.0

            if elapsed < self.min_interval:
                wait_time = self.min_interval - elapsed
                logger.debug(
                    f"Rate limiter '{self.name}': sleeping for {wait_time:.3f}s"
                )
                time.sleep(wait_time)

            self._last_request_time = time.time()
            self._request_count += 1

            return wait_time

    def try_acquire(self) -> bool:
        """
        Try to acquire a rate limit slot without blocking.

        Returns:
            True if slot acquired, False if rate limited
        """
        with self._lock:
            current_time = time.time()
            elapsed = current_time - self._last_request_time

            if elapsed >= self.min_interval:
                self._last_request_time = current_time
                self._request_count += 1
                return True

            return False

    @property
    def request_count(self) -> int:
        """Get total requests made through this limiter."""
        return self._request_count

    def reset(self) -> None:
        """Reset the rate limiter state."""
        with self._lock:
            self._last_request_time = 0.0
            self._request_count = 0


class MultiServiceRateLimiter:
    """
    Manages rate limiters for multiple services.

    Example:
        limiters = MultiServiceRateLimiter()
        limiters.add('nominatim', min_interval=1.0)
        limiters.add('rentcast', min_interval=0.05)  # 20 req/sec

        # Use
        limiters.wait('nominatim')
        response = nominatim_request()
    """

    def __init__(self):
        """Initialize the multi-service rate limiter."""
        self._limiters: dict[str, RateLimiter] = {}
        self._lock = Lock()

    def add(self, service_name: str, min_interval: float) -> RateLimiter:
        """
        Add a rate limiter for a service.

        Args:
            service_name: Name of the service
            min_interval: Minimum seconds between requests

        Returns:
            The created RateLimiter
        """
        with self._lock:
            if service_name not in self._limiters:
                self._limiters[service_name] = RateLimiter(
                    min_interval=min_interval,
                    name=service_name
                )
            return self._limiters[service_name]

    def get(self, service_name: str) -> Optional[RateLimiter]:
        """Get a rate limiter by service name."""
        return self._limiters.get(service_name)

    def wait(self, service_name: str) -> float:
        """
        Wait for rate limit on a service.

        Args:
            service_name: Name of the service

        Returns:
            Wait time in seconds

        Raises:
            KeyError: If service not registered
        """
        limiter = self._limiters.get(service_name)
        if limiter is None:
            raise KeyError(f"No rate limiter registered for service: {service_name}")
        return limiter.wait()

    def try_acquire(self, service_name: str) -> bool:
        """
        Try to acquire a slot for a service without blocking.

        Args:
            service_name: Name of the service

        Returns:
            True if acquired, False if rate limited

        Raises:
            KeyError: If service not registered
        """
        limiter = self._limiters.get(service_name)
        if limiter is None:
            raise KeyError(f"No rate limiter registered for service: {service_name}")
        return limiter.try_acquire()

    def reset_all(self) -> None:
        """Reset all rate limiters."""
        with self._lock:
            for limiter in self._limiters.values():
                limiter.reset()


# =============================================================================
# Pre-configured Rate Limiters
# =============================================================================

# Default rate limiters for known services
# These are module-level singletons, reset on Lambda cold start

_nominatim_limiter: Optional[RateLimiter] = None
_rentcast_limiter: Optional[RateLimiter] = None


def get_nominatim_limiter() -> RateLimiter:
    """
    Get the Nominatim rate limiter (1 request per second).

    Nominatim usage policy requires maximum 1 request per second.
    https://operations.osmfoundation.org/policies/nominatim/
    """
    global _nominatim_limiter
    if _nominatim_limiter is None:
        _nominatim_limiter = RateLimiter(min_interval=1.0, name='nominatim')
    return _nominatim_limiter


def get_rentcast_limiter() -> RateLimiter:
    """
    Get the Rentcast rate limiter (20 requests per second).

    Rentcast allows 20 requests per second.
    """
    global _rentcast_limiter
    if _rentcast_limiter is None:
        _rentcast_limiter = RateLimiter(min_interval=0.05, name='rentcast')
    return _rentcast_limiter


def reset_all_limiters() -> None:
    """Reset all pre-configured rate limiters (for testing)."""
    global _nominatim_limiter, _rentcast_limiter
    _nominatim_limiter = None
    _rentcast_limiter = None
