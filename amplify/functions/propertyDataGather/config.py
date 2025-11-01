"""Configuration module for propertyDataGather functions."""

import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
PERPLEXITY_API_KEY = os.getenv('PERPLEXITY_API_KEY')
APIFY_API_KEY = os.getenv('APIFY_API_KEY')

# Default timeouts and retries
DEFAULT_TIMEOUT = 30
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0

# Apify Configuration
APIFY_ACTOR_ID = 'maxcopell/zillow-zip-search'
APIFY_DEFAULT_TIMEOUT = 300  # 5 minutes
APIFY_DEFAULT_MAX_ITEMS = 50

# Standard System Prompt (used by all Perplexity functions)
STANDARD_SYSTEM_PROMPT = "Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information."
