/**
 * Workflow Orchestrator
 * Manages the execution flow of property data gathering functions
 */

import { PerplexityClient } from '../common';
import {
  getCountyName,
  getNeighborhoodName,
  getInitialPropertyInfo,
  FunctionResult
} from '../propertyDataGather';
import {
  RentalWorkflowInput,
  RentalWorkflowOutput,
  WorkflowState,
  WorkflowStepResult,
  ParallelExecutionConfig
} from './types';

/**
 * Main orchestrator class for the rental workflow
 */
export class RentalWorkflowOrchestrator {
  private client: PerplexityClient;
  private state: WorkflowState;

  constructor(client: PerplexityClient, input: RentalWorkflowInput) {
    this.client = client;
    this.state = {
      input,
      startTime: Date.now(),
      steps: {
        county: { stepName: 'county', success: false },
        neighborhood: { stepName: 'neighborhood', success: false },
        propertyInfo: { stepName: 'propertyInfo', success: false }
      },
      metadata: {
        totalApiCalls: 0,
        totalExecutionTime: 0
      }
    };
  }

  /**
   * Execute the complete workflow
   */
  async execute(): Promise<RentalWorkflowOutput> {
    const workflowStartTime = new Date().toISOString();

    try {
      // Step 1: County Lookup (Required for property details)
      await this.executeCountyLookup();

      // Step 2: Parallel execution of property details and neighborhood lookup
      // Only run property details if county lookup succeeded
      if (this.state.steps.county.success) {
        await this.executeParallelSteps();
      } else {
        // Still run neighborhood lookup even if county failed
        await this.executeNeighborhoodLookup();
      }

      // Generate final output
      return this.generateOutput(workflowStartTime);

    } catch (error) {
      // Handle catastrophic failure
      return this.generateErrorOutput(error, workflowStartTime);
    }
  }

  /**
   * Execute county lookup
   */
  private async executeCountyLookup(): Promise<void> {
    const stepStartTime = Date.now();

    try {
      const result = await getCountyName(this.client, {
        city_name: this.state.input.city,
        state_name: this.state.input.state
      });

      this.state.steps.county = {
        stepName: 'county',
        success: result.success,
        data: result.data,
        error: result.error,
        errorCode: result.errorCode,
        metadata: {
          ...result.metadata,
          executionTime: Date.now() - stepStartTime
        }
      };

      this.updateMetadata(result);

    } catch (error) {
      this.state.steps.county = {
        stepName: 'county',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'EXECUTION_ERROR',
        metadata: {
          executionTime: Date.now() - stepStartTime
        }
      };
    }
  }

  /**
   * Execute neighborhood lookup
   */
  private async executeNeighborhoodLookup(): Promise<void> {
    const stepStartTime = Date.now();

    try {
      const result = await getNeighborhoodName(this.client, {
        street: this.state.input.street,
        city: this.state.input.city,
        state: this.state.input.state,
        zip: this.state.input.zip
      });

      this.state.steps.neighborhood = {
        stepName: 'neighborhood',
        success: result.success,
        data: result.data,
        error: result.error,
        errorCode: result.errorCode,
        metadata: {
          ...result.metadata,
          executionTime: Date.now() - stepStartTime
        }
      };

      this.updateMetadata(result);

    } catch (error) {
      this.state.steps.neighborhood = {
        stepName: 'neighborhood',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'EXECUTION_ERROR',
        metadata: {
          executionTime: Date.now() - stepStartTime
        }
      };
    }
  }

  /**
   * Execute property details lookup
   */
  private async executePropertyDetails(): Promise<void> {
    const stepStartTime = Date.now();

    try {
      // This requires county_name from the previous step
      if (!this.state.steps.county.data?.county_name) {
        throw new Error('County name not available for property details lookup');
      }

      const result = await getInitialPropertyInfo(this.client, {
        street: this.state.input.street,
        city: this.state.input.city,
        state: this.state.input.state,
        zip: this.state.input.zip,
        county_name: this.state.steps.county.data.county_name
      });

      this.state.steps.propertyInfo = {
        stepName: 'propertyInfo',
        success: result.success,
        data: result.data,
        error: result.error,
        errorCode: result.errorCode,
        metadata: {
          ...result.metadata,
          executionTime: Date.now() - stepStartTime
        }
      };

      this.updateMetadata(result);

    } catch (error) {
      this.state.steps.propertyInfo = {
        stepName: 'propertyInfo',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'EXECUTION_ERROR',
        metadata: {
          executionTime: Date.now() - stepStartTime
        }
      };
    }
  }

  /**
   * Execute parallel steps
   */
  private async executeParallelSteps(): Promise<void> {
    const parallelTasks: ParallelExecutionConfig = {
      tasks: [
        {
          name: 'propertyInfo',
          execute: () => this.executePropertyDetails().then(() => ({ success: true }))
        },
        {
          name: 'neighborhood',
          execute: () => this.executeNeighborhoodLookup().then(() => ({ success: true }))
        }
      ],
      continueOnError: true
    };

    // Execute tasks in parallel using Promise.allSettled
    const promises = parallelTasks.tasks.map(task => task.execute());
    await Promise.allSettled(promises);
  }

  /**
   * Update workflow metadata from a function result
   */
  private updateMetadata(result: FunctionResult<any>): void {
    if (result.metadata) {
      this.state.metadata.totalApiCalls += result.metadata.apiCalls || 0;
    }
  }

  /**
   * Generate the final workflow output
   */
  private generateOutput(workflowStartTime: string): RentalWorkflowOutput {
    const workflowEndTime = new Date().toISOString();
    const totalExecutionTime = Date.now() - this.state.startTime;

    // Determine completed and failed steps
    const completedSteps: string[] = [];
    const failedSteps: string[] = [];
    const errors: Array<{ step: string; error: string; code?: string }> = [];

    Object.entries(this.state.steps).forEach(([key, step]) => {
      if (step.success) {
        completedSteps.push(key);
      } else if (step.error) {
        failedSteps.push(key);
        errors.push({
          step: key,
          error: step.error,
          code: step.errorCode
        });
      }
    });

    // Build the data object
    const data: RentalWorkflowOutput['data'] = {
      address: this.state.input
    };

    if (this.state.steps.county.success && this.state.steps.county.data) {
      data.county = this.state.steps.county.data;
    }

    if (this.state.steps.neighborhood.success && this.state.steps.neighborhood.data) {
      data.neighborhood = this.state.steps.neighborhood.data;
    }

    if (this.state.steps.propertyInfo.success && this.state.steps.propertyInfo.data) {
      data.propertyInfo = this.state.steps.propertyInfo.data;
    }

    return {
      success: completedSteps.length > 0,
      completedSteps,
      failedSteps,
      data,
      metadata: {
        totalApiCalls: this.state.metadata.totalApiCalls,
        totalExecutionTime,
        workflowStartTime,
        workflowEndTime,
        stepDetails: Object.values(this.state.steps).filter(step => step.stepName)
      },
      ...(errors.length > 0 && { errors })
    };
  }

  /**
   * Generate error output for catastrophic failures
   */
  private generateErrorOutput(error: unknown, workflowStartTime: string): RentalWorkflowOutput {
    const workflowEndTime = new Date().toISOString();
    const totalExecutionTime = Date.now() - this.state.startTime;

    return {
      success: false,
      completedSteps: [],
      failedSteps: ['workflow'],
      data: {
        address: this.state.input
      },
      metadata: {
        totalApiCalls: this.state.metadata.totalApiCalls,
        totalExecutionTime,
        workflowStartTime,
        workflowEndTime,
        stepDetails: []
      },
      errors: [{
        step: 'workflow',
        error: error instanceof Error ? error.message : 'Unknown workflow error',
        code: 'WORKFLOW_ERROR'
      }]
    };
  }
}