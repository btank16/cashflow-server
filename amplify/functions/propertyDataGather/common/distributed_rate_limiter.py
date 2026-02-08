"""
Distributed rate limiter using DynamoDB for cross-Lambda coordination.

This module provides rate limiting that works across multiple concurrent Lambda
invocations, ensuring external API rate limits are respected globally.

Uses a sliding window counter algorithm with atomic DynamoDB updates.
"""

import os
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class RateLimitService(str, Enum):
    """Supported services for rate limiting."""
    GOOGLE_ADDRESS_VALIDATION = 'google_address_validation'
    AWS_GEO_PLACES = 'aws_geo_places'
    RENTCAST = 'rentcast'
    OVERPASS = 'overpass'


@dataclass
class RateLimitConfig:
    """Configuration for a rate-limited service."""
    service: RateLimitService
    requests_per_window: int
    window_seconds: int = 1

    @property
    def requests_per_second(self) -> float:
        """Calculate requests per second for logging."""
        return self.requests_per_window / self.window_seconds


# Pre-configured rate limits for each service
RATE_LIMIT_CONFIGS: Dict[RateLimitService, RateLimitConfig] = {
    RateLimitService.GOOGLE_ADDRESS_VALIDATION: RateLimitConfig(
        service=RateLimitService.GOOGLE_ADDRESS_VALIDATION,
        requests_per_window=50,
        window_seconds=1  
    ),
    RateLimitService.AWS_GEO_PLACES: RateLimitConfig(
        service=RateLimitService.AWS_GEO_PLACES,
        requests_per_window=50,
        window_seconds=1  
    ),
    RateLimitService.RENTCAST: RateLimitConfig(
        service=RateLimitService.RENTCAST,
        requests_per_window=20,
        window_seconds=1  # 20 requests per second per Rentcast API docs
    ),
    RateLimitService.OVERPASS: RateLimitConfig(
        service=RateLimitService.OVERPASS,
        requests_per_window=1,
        window_seconds=2  # 1 request per 2 seconds (conservative for free service)
    ),
}


class DistributedRateLimitError(Exception):
    """Raised when rate limit cannot be acquired within timeout."""
    pass


class DistributedRateLimiter:
    """
    DynamoDB-backed distributed rate limiter using sliding window counter.

    This implementation coordinates rate limiting across multiple Lambda
    invocations by using DynamoDB atomic updates to track request counts
    per time window.

    Algorithm:
    1. Time is divided into fixed windows (e.g., 1-second intervals)
    2. Each window has a counter stored in DynamoDB
    3. Before making an API call, atomically increment the counter
    4. If counter <= limit, proceed; otherwise wait for next window
    5. Old windows auto-expire via DynamoDB TTL

    Example:
        limiter = DistributedRateLimiter(table_name='RateLimitCounter')

        # Acquire a slot (blocks until available or timeout)
        if limiter.acquire(RateLimitService.GOOGLE_ADDRESS_VALIDATION, timeout=10.0):
            response = geocode_request()
        else:
            raise Exception("Rate limit timeout")
    """

    def __init__(self, table_name: Optional[str] = None):
        """
        Initialize the distributed rate limiter.

        Args:
            table_name: DynamoDB table name. If not provided, reads from
                       RATE_LIMIT_TABLE_NAME environment variable.
        """
        self.table_name = table_name or os.environ.get('RATE_LIMIT_TABLE_NAME', '')
        if not self.table_name:
            logger.warning("No rate limit table configured, falling back to local limiting")
            self._dynamodb = None
            self._table = None
        else:
            self._dynamodb = boto3.resource('dynamodb')
            self._table = self._dynamodb.Table(self.table_name)

        # Track request counts for metrics
        self._request_counts: Dict[str, int] = {}
        self._wait_times: Dict[str, float] = {}

    def _get_current_window(self, window_seconds: int) -> str:
        """Get the current time window as a string key."""
        current_time = time.time()
        window_start = int(current_time / window_seconds) * window_seconds
        return str(window_start)

    def _get_time_until_next_window(self, window_seconds: int) -> float:
        """Calculate seconds until the next time window starts."""
        current_time = time.time()
        window_start = int(current_time / window_seconds) * window_seconds
        next_window = window_start + window_seconds
        return next_window - current_time

    def _increment_counter(self, service: str, window: str, ttl: int) -> int:
        """
        Atomically increment the counter for a service/window.

        Args:
            service: Service name
            window: Time window key
            ttl: TTL timestamp for auto-cleanup

        Returns:
            The new counter value after increment
        """
        if self._table is None:
            # No DynamoDB configured, return 1 (always allow)
            return 1

        try:
            now = datetime.now(timezone.utc).isoformat()
            response = self._table.update_item(
                Key={
                    'service': service,
                    'window': window
                },
                UpdateExpression='SET request_count = if_not_exists(request_count, :zero) + :inc, #ttl = :ttl, updatedAt = :now, createdAt = if_not_exists(createdAt, :now)',
                ExpressionAttributeNames={
                    '#ttl': 'ttl'
                },
                ExpressionAttributeValues={
                    ':inc': 1,
                    ':zero': 0,
                    ':ttl': ttl,
                    ':now': now
                },
                ReturnValues='ALL_NEW'
            )
            return int(response['Attributes']['request_count'])
        except ClientError as e:
            logger.error(f"DynamoDB error incrementing counter: {e}")
            # On error, allow the request (fail open)
            return 1

    def try_acquire(self, service: RateLimitService) -> bool:
        """
        Try to acquire a rate limit slot without blocking.

        Args:
            service: The service to acquire a slot for

        Returns:
            True if slot acquired, False if rate limited
        """
        config = RATE_LIMIT_CONFIGS.get(service)
        if config is None:
            logger.warning(f"Unknown service: {service}, allowing request")
            return True

        window = self._get_current_window(config.window_seconds)
        ttl = int(time.time()) + 60  # Expire after 60 seconds

        count = self._increment_counter(service.value, window, ttl)

        # Track metrics
        self._request_counts[service.value] = self._request_counts.get(service.value, 0) + 1

        if count <= config.requests_per_window:
            logger.debug(f"Rate limit acquired for {service.value}: {count}/{config.requests_per_window}")
            return True
        else:
            logger.debug(f"Rate limited for {service.value}: {count}/{config.requests_per_window}")
            return False

    def acquire(
        self,
        service: RateLimitService,
        timeout: float = 30.0,
        max_retries: int = 100
    ) -> bool:
        """
        Acquire a rate limit slot, waiting if necessary.

        This method will block until a slot is available or the timeout
        is reached. It uses exponential backoff within each window.

        Args:
            service: The service to acquire a slot for
            timeout: Maximum seconds to wait for a slot
            max_retries: Maximum number of retry attempts

        Returns:
            True if slot acquired, False if timeout reached
        """
        config = RATE_LIMIT_CONFIGS.get(service)
        if config is None:
            logger.warning(f"Unknown service: {service}, allowing request")
            return True

        start_time = time.time()
        retries = 0
        total_wait = 0.0

        while retries < max_retries:
            elapsed = time.time() - start_time
            if elapsed >= timeout:
                logger.warning(
                    f"Rate limit timeout for {service.value} after {elapsed:.2f}s "
                    f"({retries} retries, {total_wait:.2f}s waiting)"
                )
                return False

            if self.try_acquire(service):
                if total_wait > 0:
                    logger.info(
                        f"Rate limit acquired for {service.value} after {total_wait:.2f}s wait"
                    )
                self._wait_times[service.value] = self._wait_times.get(service.value, 0) + total_wait
                return True

            # Calculate wait time until next window
            wait_time = self._get_time_until_next_window(config.window_seconds)

            # Cap wait time to remaining timeout
            remaining_timeout = timeout - elapsed
            wait_time = min(wait_time, remaining_timeout)

            if wait_time > 0:
                logger.debug(
                    f"Rate limited for {service.value}, waiting {wait_time:.3f}s for next window"
                )
                time.sleep(wait_time)
                total_wait += wait_time

            retries += 1

        logger.warning(f"Rate limit max retries ({max_retries}) reached for {service.value}")
        return False

    def get_metrics(self) -> Dict[str, Any]:
        """Get rate limiting metrics for monitoring."""
        return {
            'request_counts': self._request_counts.copy(),
            'total_wait_times': self._wait_times.copy()
        }

    def reset_metrics(self) -> None:
        """Reset metrics counters."""
        self._request_counts.clear()
        self._wait_times.clear()


# =============================================================================
# Module-level singleton and convenience functions
# =============================================================================

_distributed_limiter: Optional[DistributedRateLimiter] = None


def get_distributed_limiter(table_name: Optional[str] = None) -> DistributedRateLimiter:
    """
    Get the singleton distributed rate limiter instance.

    Args:
        table_name: Optional table name override (only used on first call)

    Returns:
        The distributed rate limiter instance
    """
    global _distributed_limiter
    if _distributed_limiter is None:
        _distributed_limiter = DistributedRateLimiter(table_name)
    return _distributed_limiter


def acquire_rate_limit(
    service: RateLimitService,
    timeout: float = 30.0
) -> bool:
    """
    Convenience function to acquire a rate limit slot.

    Args:
        service: The service to acquire a slot for
        timeout: Maximum seconds to wait

    Returns:
        True if acquired, False if timeout
    """
    limiter = get_distributed_limiter()
    return limiter.acquire(service, timeout)


def try_acquire_rate_limit(service: RateLimitService) -> bool:
    """
    Convenience function to try acquiring a rate limit slot without blocking.

    Args:
        service: The service to acquire a slot for

    Returns:
        True if acquired, False if rate limited
    """
    limiter = get_distributed_limiter()
    return limiter.try_acquire(service)


def reset_distributed_limiter() -> None:
    """Reset the singleton rate limiter (for testing)."""
    global _distributed_limiter
    _distributed_limiter = None
