/**
 * Type definitions for the Rental Workflow Lambda function
 * Orchestrates multiple property data gathering functions
 */

import {
  Address,
  CountyNameOutput,
  NeighborhoodNameOutput,
  InitialPropertyInfoOutput,
  FunctionResult,
  ZillowZipSearchOutput,
  InterestRateFinalOutput,
  PropertyTaxRealtorOutput,
  ApartmentCompOutput
} from '../propertyDataGather/types';

/**
 * Input for the rental workflow - uses the common Address type
 */
export interface RentalWorkflowInput extends Address {}

/**
 * Configuration options for the rental workflow
 */
export interface WorkflowConfig {
  defaultDownPayment?: number;    // Default: 20
  defaultLoanType?: string;        // Default: "30-year fixed"
  maxZillowResults?: number;       // Default: 50
  zillowDaysBack?: string;         // Default: "30"
}

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
  skippedSteps?: string[];
  data: {
    address: Address;
    county?: CountyNameOutput;
    neighborhood?: NeighborhoodNameOutput;
    propertyInfo?: InitialPropertyInfoOutput;
    zillowComps?: ZillowZipSearchOutput;
    interestRate?: InterestRateFinalOutput;
    propertyTax?: PropertyTaxRealtorOutput;
    apartmentComps?: {
      [bedBathKey: string]: ApartmentCompOutput;
    };
  };
  metadata: {
    totalApiCalls: number;
    totalExecutionTime: number;
    workflowStartTime: string;
    workflowEndTime: string;
    isMetroArea?: boolean;
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
  config: WorkflowConfig;
  startTime: number;
  steps: {
    // Phase 1 steps
    county: WorkflowStepResult<CountyNameOutput>;
    neighborhood: WorkflowStepResult<NeighborhoodNameOutput>;
    propertyInfo: WorkflowStepResult<InitialPropertyInfoOutput>;
    // Phase 2 steps
    zillowSearch?: WorkflowStepResult<ZillowZipSearchOutput>;
    interestRate?: WorkflowStepResult<InterestRateFinalOutput>;
    propertyTax?: WorkflowStepResult<PropertyTaxRealtorOutput>;
    apartmentComps?: {
      [bedBathKey: string]: WorkflowStepResult<ApartmentCompOutput>;
    };
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