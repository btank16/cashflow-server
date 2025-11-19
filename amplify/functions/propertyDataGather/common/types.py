"""Type definitions for propertyDataGather functions."""

from typing import Optional, Dict, Any, List, TypeVar, Generic
from pydantic import BaseModel
from enum import Enum

T = TypeVar('T')

class ErrorCode(str, Enum):
    """Standard error codes for function results."""
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


class FunctionMetadata(BaseModel):
    """Metadata for function execution."""
    api_calls: int = 0
    execution_time: float = 0.0
    model: Optional[str] = None
    search_domains: Optional[List[str]] = None
    cache_hit: bool = False
    search_scope: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


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
