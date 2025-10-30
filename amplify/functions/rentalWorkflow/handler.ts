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
 * @returns The workflow output with all gathered property data
 */
export const handler = async (event: any): Promise<any> => {
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

    // Return the workflow result
    return {
      statusCode: result.success ? 200 : 207, // 207 for partial success
      body: JSON.stringify(result),
      headers: {
        'Content-Type': 'application/json'
      }
    };

  } catch (error) {
    console.error('Handler error:', error);

    // Return a structured error response
    const errorResponse: RentalWorkflowOutput = {
      success: false,
      completedSteps: [],
      failedSteps: ['handler'],
      data: {
        address: {
          street: '',
          city: '',
          state: '',
          zip: ''
        }
      },
      metadata: {
        totalApiCalls: 0,
        totalExecutionTime: Date.now() - startTime,
        workflowStartTime: new Date(startTime).toISOString(),
        workflowEndTime: new Date().toISOString(),
        stepDetails: []
      },
      errors: [{
        step: 'handler',
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        code: 'HANDLER_ERROR'
      }]
    };

    return {
      statusCode: 500,
      body: JSON.stringify(errorResponse),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
};