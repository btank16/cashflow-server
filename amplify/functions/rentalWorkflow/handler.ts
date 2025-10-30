/**
 * Rental Workflow Lambda Handler
 * Entry point for the rental property data gathering workflow
 */

import { PerplexityClient, validateInput, createErrorResponse } from '../common';
import { RentalWorkflowOrchestrator } from './orchestrator';
import { RentalWorkflowInput, RentalWorkflowOutput } from './types';

/**
 * Lambda handler function
 * @param event - The input event containing address information
 * @returns The workflow output with all gathered property data or error response
 */
export const handler = async (event: any) => {
  console.log('Rental Workflow started:', JSON.stringify(event));
  const startTime = Date.now();

  try {
    // Parse the input
    const input: RentalWorkflowInput = typeof event === 'string'
      ? JSON.parse(event)
      : event;

    // Validate required address fields
    const validation = validateInput(input, ['street', 'city', 'state', 'zip']);
    if (!validation.isValid) {
      console.error('Validation failed:', validation.missingFields);
      return createErrorResponse(
        `Missing required address fields: ${validation.missingFields.join(', ')}`,
        'VALIDATION_ERROR'
      );
    }

    // Get the API key
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('Perplexity API key not configured');
      return createErrorResponse('Perplexity API key not configured', 'CONFIG_ERROR');
    }

    // Initialize Perplexity client
    const client = new PerplexityClient(apiKey);

    // Initialize and execute the workflow orchestrator
    const orchestrator = new RentalWorkflowOrchestrator(client, input);
    const result = await orchestrator.execute();

    // Log execution summary
    console.log('Workflow completed:', {
      success: result.success,
      completedSteps: result.completedSteps,
      failedSteps: result.failedSteps,
      totalApiCalls: result.metadata.totalApiCalls,
      totalExecutionTime: Date.now() - startTime
    });

    // Return the workflow result directly (matches other Lambda functions pattern)
    return result;

  } catch (error) {
    console.error('Handler error:', error);

    // Return error using standard error response format
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      'HANDLER_ERROR'
    );
  }
};