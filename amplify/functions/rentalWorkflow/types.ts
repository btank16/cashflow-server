/**
 * Type definitions for the Rental Workflow Lambda function
 * Orchestrates multiple property data gathering functions
 */

import {
  Address,
  CountyNameOutput,
  NeighborhoodNameOutput,
  InitialPropertyInfoOutput,
  FunctionResult
} from '../propertyDataGather/types';

/**
 * Input for the rental workflow - uses the common Address type
 */
export interface RentalWorkflowInput extends Address {}

/**
 * Result of a single workflow step
 */
export interface WorkflowStepResult<T = any> {
  stepName: string;
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  metadata?: {
    apiCalls?: number;
    executionTime?: number;
    model?: string;
    searchDomains?: string[];
    retryAttempted?: boolean;
  };
}

/**
 * Complete output of the rental workflow
 */
export interface RentalWorkflowOutput {
  success: boolean;
  completedSteps: string[];
  failedSteps: string[];
  data: {
    address: Address;
    county?: CountyNameOutput;
    neighborhood?: NeighborhoodNameOutput;
    propertyInfo?: InitialPropertyInfoOutput;
  };
  metadata: {
    totalApiCalls: number;
    totalExecutionTime: number;
    workflowStartTime: string;
    workflowEndTime: string;
    stepDetails: WorkflowStepResult[];
  };
  errors?: Array<{
    step: string;
    error: string;
    code?: string;
  }>;
}

/**
 * Internal workflow state for tracking progress
 */
export interface WorkflowState {
  input: RentalWorkflowInput;
  startTime: number;
  steps: {
    county: WorkflowStepResult<CountyNameOutput>;
    neighborhood: WorkflowStepResult<NeighborhoodNameOutput>;
    propertyInfo: WorkflowStepResult<InitialPropertyInfoOutput>;
  };
  metadata: {
    totalApiCalls: number;
    totalExecutionTime: number;
  };
}

/**
 * Configuration for parallel execution
 */
export interface ParallelExecutionConfig {
  tasks: Array<{
    name: string;
    execute: () => Promise<FunctionResult<any>>;
  }>;
  continueOnError?: boolean;
}