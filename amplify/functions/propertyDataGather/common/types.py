"""Type definitions for propertyDataGather functions."""

from typing import Optional, Dict, Any, List, TypeVar, Generic
from pydantic import BaseModel
from enum import Enum

T = TypeVar('T')

class ErrorCode(str, Enum):
    """Standard error codes for function results."""
    # General errors
    VALIDATION_ERROR = 'VALIDATION_ERROR'
    API_ERROR = 'API_ERROR'
    NO_DATA = 'NO_DATA'
    DATA_VALIDATION_ERROR = 'DATA_VALIDATION_ERROR'
    CONFIG_ERROR = 'CONFIG_ERROR'
    INTERNAL_ERROR = 'INTERNAL_ERROR'
    NOT_FOUND = 'NOT_FOUND'
    TIMEOUT_ERROR = 'TIMEOUT_ERROR'
    RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR'
    ACTOR_ERROR = 'ACTOR_ERROR'
    EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR'

    # Workflow-specific errors
    MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD'
    INVALID_COORDINATES = 'INVALID_COORDINATES'
    DEPENDENCY_FAILED = 'DEPENDENCY_FAILED'
    SKIPPED = 'SKIPPED'


class FunctionMetadata(BaseModel):
    """Metadata for function execution."""
    # Core metrics
    api_calls: int = 0
    execution_time: float = 0.0

    # AI model info
    model: Optional[str] = None
    search_domains: Optional[List[str]] = None

    # Cache info
    cache_hit: bool = False

    # Search context
    search_scope: Optional[str] = None

    # Source tracking (e.g., 'nominatim', 'perplexity', 'rentcast')
    source: Optional[str] = None

    # Query tracking for debugging
    query: Optional[str] = None

    # Result info
    result_count: Optional[int] = None

    # Extensible extra data
    extra: Optional[Dict[str, Any]] = None

    def merge(self, other: 'FunctionMetadata') -> 'FunctionMetadata':
        """Merge two metadata objects, summing counters."""
        return FunctionMetadata(
            api_calls=self.api_calls + other.api_calls,
            execution_time=self.execution_time + other.execution_time,
            model=other.model or self.model,
            search_domains=(self.search_domains or []) + (other.search_domains or []),
            cache_hit=self.cache_hit or other.cache_hit,
            search_scope=other.search_scope or self.search_scope,
            source=other.source or self.source,
            query=other.query or self.query,
            result_count=other.result_count,
            extra={**(self.extra or {}), **(other.extra or {})}
        )


class FunctionResult(BaseModel, Generic[T]):
    """Standard result wrapper for all functions."""
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None
    error_code: Optional[ErrorCode] = None
    metadata: Optional[FunctionMetadata] = None


class Address(BaseModel):
    """Standard address structure."""
    street: str
    city: str
    state: str
    zip: str


class ExtendedAddress(Address):
    """Address with optional county and neighborhood."""
    county: Optional[str] = None
    neighborhood: Optional[str] = None
