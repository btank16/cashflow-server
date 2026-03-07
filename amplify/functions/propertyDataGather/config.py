"""Configuration module for propertyDataGather functions."""

import os

# API Keys (for local development only - Lambda uses SSM)
# These are not used in Lambda deployment, only for local testing
PERPLEXITY_API_KEY = os.getenv('PERPLEXITY_API_KEY')
RENTCAST_API_KEY = os.getenv('RENTCAST_API_KEY')

# Default timeouts and retries
DEFAULT_TIMEOUT = 30
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0

# Rentcast Configuration
RENTCAST_BASE_URL = 'https://api.rentcast.io/v1'
RENTCAST_DEFAULT_TIMEOUT = 30
RENTCAST_DEFAULT_LIMIT = 100  # Default limit, max is 500

# Gemini Configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_DEFAULT_MODEL = 'gemini-pro-latest'
GEMINI_DEFAULT_TIMEOUT = 30
GEMINI_THINKING_LEVEL = 'low'  # 'low' for simple tasks, 'high' for complex reasoning

# Standard System Prompt (used by all Perplexity functions)
STANDARD_SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information."
