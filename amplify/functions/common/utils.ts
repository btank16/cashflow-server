/**
 * Common utilities for Lambda functions
 */

/**
 * Validates required input fields
 * @param input - Input object to validate
 * @param requiredFields - Array of required field names
 * @returns Validation result with missing fields
 */
export function validateInput(
  input: Record<string, any>,
  requiredFields: string[]
): { isValid: boolean; missingFields: string[] } {
  const missingFields = requiredFields.filter(field => !input[field]);

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Creates a standard error response
 * @param message - Error message
 * @param code - Error code
 * @returns Formatted error response
 */
export function createErrorResponse(message: string, code: string = 'ERROR') {
  return {
    success: false,
    error: {
      code,
      message
    }
  };
}

/**
 * Creates a standard success response
 * @param data - Response data
 * @returns Formatted success response
 */
export function createSuccessResponse(data: any) {
  return {
    success: true,
    data
  };
}

/**
 * Retry logic for API calls
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param delay - Delay between retries in milliseconds
 * @returns Result of the function call
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < maxRetries - 1) {
        // Exponential backoff
        const waitTime = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError!;
}