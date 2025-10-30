/**
 * Workflow Orchestrator
 * Manages the execution flow of property data gathering functions
 */

import { PerplexityClient } from '../common';
import {
  getCountyName,
  getNeighborhoodName,
  getInitialPropertyInfo,
  getPropertyTax,
  getInterestRate,
  getApartmentComps,
  searchZillowByZip,
  FunctionResult,
  isValidCity
} from '../propertyDataGather';
import {
  RentalWorkflowInput,
  RentalWorkflowOutput,
  WorkflowState,
  WorkflowConfig,
  ParallelExecutionConfig
} from './types';

/**
 * Default workflow configuration
 */
const DEFAULT_CONFIG: WorkflowConfig = {
  defaultDownPayment: 20,
  defaultLoanType: '30-year fixed',
  maxZillowResults: 50,
  zillowDaysBack: '30'
};

/**
 * Main orchestrator class for the rental workflow
 */
export class RentalWorkflowOrchestrator {
  private client: PerplexityClient;
  private state: WorkflowState;

  constructor(client: PerplexityClient, input: RentalWorkflowInput, config?: Partial<WorkflowConfig>) {
    this.client = client;
    this.state = {
      input,
      config: { ...DEFAULT_CONFIG, ...config },
      startTime: Date.now(),
      steps: {
        county: { stepName: 'county', success: false },
        neighborhood: { stepName: 'neighborhood', success: false },
        propertyInfo: { stepName: 'propertyInfo', success: false },
        apartmentComps: {}
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
      // Phase 1: Basic property information gathering

      // Step 1: County Lookup (Required for property details)
      await this.executeCountyLookup();

      // Step 2: Check if city is a metro area to determine if neighborhood lookup is needed
      const isMetroArea = isValidCity(this.state.input.city);

      // Step 3: Conditional parallel execution of property details and neighborhood
      // Only run property details if county lookup succeeded
      if (this.state.steps.county.success) {
        await this.executeParallelSteps(isMetroArea);
      } else if (isMetroArea) {
        // If county failed but it's a metro area, still try neighborhood lookup
        await this.executeNeighborhoodLookup();
      }

      // Phase 2: Market research and comps (only if property info succeeded)
      if (this.state.steps.propertyInfo.success) {
        await this.executePhase2();
      }

      // Generate final output
      return this.generateOutput(workflowStartTime, isMetroArea);

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
   * @param includeNeighborhood - Whether to include neighborhood lookup (only for metro areas)
   */
  private async executeParallelSteps(includeNeighborhood: boolean): Promise<void> {
    const tasks = [
      {
        name: 'propertyInfo',
        execute: () => this.executePropertyDetails().then(() => ({ success: true }))
      }
    ];

    // Only add neighborhood lookup task if city is a metro area
    if (includeNeighborhood) {
      tasks.push({
        name: 'neighborhood',
        execute: () => this.executeNeighborhoodLookup().then(() => ({ success: true }))
      });
    } else {
      // Mark neighborhood as skipped (not an error)
      this.state.steps.neighborhood = {
        stepName: 'neighborhood',
        success: false,
        error: 'Skipped - city is not a metro area',
        errorCode: 'SKIPPED',
        metadata: {
          executionTime: 0
        }
      };
    }

    const parallelTasks: ParallelExecutionConfig = {
      tasks,
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
   * Get unique bed/bath combinations from property info
   */
  private getUniqueBedBathCombinations(): Array<{ bed: number; bath: number }> {
    const propertyData = this.state.steps.propertyInfo.data;
    if (!propertyData || !propertyData.unit_bed || !propertyData.unit_bath) {
      return [];
    }

    const combinations = new Map<string, { bed: number; bath: number }>();

    for (let i = 0; i < propertyData.unit_bed.length; i++) {
      const key = `${propertyData.unit_bed[i]}_${propertyData.unit_bath[i]}`;
      if (!combinations.has(key)) {
        combinations.set(key, {
          bed: propertyData.unit_bed[i],
          bath: propertyData.unit_bath[i]
        });
      }
    }

    return Array.from(combinations.values());
  }

  /**
   * Execute Zillow ZIP search
   */
  private async executeZillowSearch(): Promise<void> {
    const stepStartTime = Date.now();

    try {
      const result = await searchZillowByZip({
        zipCodes: [this.state.input.zip],
        daysOnZillow: this.state.config.zillowDaysBack,
        sold: true,
        forSaleByAgent: false,
        forSaleByOwner: false,
        forRent: false,
        maxItems: this.state.config.maxZillowResults
      });

      this.state.steps.zillowSearch = {
        stepName: 'zillowSearch',
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
      this.state.steps.zillowSearch = {
        stepName: 'zillowSearch',
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
   * Execute interest rate lookup
   */
  private async executeInterestRate(): Promise<void> {
    const stepStartTime = Date.now();

    try {
      const result = await getInterestRate(this.client, {
        state_name: this.state.input.state,
        down_payment: this.state.config.defaultDownPayment!,
        loan_type: this.state.config.defaultLoanType!
      });

      this.state.steps.interestRate = {
        stepName: 'interestRate',
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
      this.state.steps.interestRate = {
        stepName: 'interestRate',
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
   * Execute property tax lookup
   */
  private async executePropertyTax(): Promise<void> {
    const stepStartTime = Date.now();

    try {
      const result = await getPropertyTax(this.client, {
        street: this.state.input.street,
        city: this.state.input.city,
        state: this.state.input.state,
        zip: this.state.input.zip,
        year: new Date().getFullYear()
      });

      this.state.steps.propertyTax = {
        stepName: 'propertyTax',
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
      this.state.steps.propertyTax = {
        stepName: 'propertyTax',
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
   * Execute apartment comp search for a specific bed/bath combination
   */
  private async executeApartmentComp(bed: number, bath: number): Promise<void> {
    const stepStartTime = Date.now();
    const key = `${bed}bd_${bath}ba`;

    try {
      const result = await getApartmentComps(this.client, {
        neighborhood: this.state.steps.neighborhood.data?.neighborhood,
        city: this.state.input.city,
        state: this.state.input.state,
        bed_count: bed,
        bath_count: bath
      });

      this.state.steps.apartmentComps![key] = {
        stepName: `apartmentComp_${key}`,
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
      this.state.steps.apartmentComps![key] = {
        stepName: `apartmentComp_${key}`,
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
   * Execute Phase 2: Parallel execution of market research functions
   */
  private async executePhase2(): Promise<void> {
    // Only proceed if we have property info
    if (!this.state.steps.propertyInfo.success) {
      return;
    }

    // Get unique bed/bath combinations for apartment searches
    const uniqueCombinations = this.getUniqueBedBathCombinations();

    // Build all parallel tasks
    const phase2Tasks = [];

    // 1. ZillowZipSearch
    phase2Tasks.push({
      name: 'zillowSearch',
      execute: () => this.executeZillowSearch().then(() => ({ success: true }))
    });

    // 2. Interest Rate
    phase2Tasks.push({
      name: 'interestRate',
      execute: () => this.executeInterestRate().then(() => ({ success: true }))
    });

    // 3. Property Tax
    phase2Tasks.push({
      name: 'propertyTax',
      execute: () => this.executePropertyTax().then(() => ({ success: true }))
    });

    // 4. Apartment Comps (one per unique combination)
    uniqueCombinations.forEach((combo) => {
      phase2Tasks.push({
        name: `apartmentComp_${combo.bed}bd_${combo.bath}ba`,
        execute: () => this.executeApartmentComp(combo.bed, combo.bath).then(() => ({ success: true }))
      });
    });

    // Execute all tasks in parallel using Promise.allSettled
    const promises = phase2Tasks.map(task => task.execute());
    await Promise.allSettled(promises);
  }

  /**
   * Generate the final workflow output
   * @param workflowStartTime - Workflow start timestamp
   * @param isMetroArea - Whether the city is a metro area
   */
  private generateOutput(workflowStartTime: string, isMetroArea: boolean): RentalWorkflowOutput {
    const workflowEndTime = new Date().toISOString();
    const totalExecutionTime = Date.now() - this.state.startTime;

    // Determine completed and failed steps
    const completedSteps: string[] = [];
    const failedSteps: string[] = [];
    const skippedSteps: string[] = [];
    const errors: Array<{ step: string; error: string; code?: string }> = [];

    // Process Phase 1 steps
    Object.entries(this.state.steps).forEach(([key, step]) => {
      // Skip apartmentComps object - handle it separately
      if (key === 'apartmentComps') return;

      const stepResult = step as any;
      if (stepResult.success) {
        completedSteps.push(key);
      } else if (stepResult.errorCode === 'SKIPPED') {
        skippedSteps.push(key);
      } else if (stepResult.error) {
        failedSteps.push(key);
        errors.push({
          step: key,
          error: stepResult.error,
          code: stepResult.errorCode
        });
      }
    });

    // Process apartment comps separately (multiple steps per combination)
    if (this.state.steps.apartmentComps) {
      Object.entries(this.state.steps.apartmentComps).forEach(([key, step]) => {
        if (step.success) {
          completedSteps.push(`apartmentComp_${key}`);
        } else if (step.error) {
          failedSteps.push(`apartmentComp_${key}`);
          errors.push({
            step: `apartmentComp_${key}`,
            error: step.error,
            code: step.errorCode
          });
        }
      });
    }

    // Build the data object
    const data: RentalWorkflowOutput['data'] = {
      address: this.state.input
    };

    // Phase 1 data
    if (this.state.steps.county.success && this.state.steps.county.data) {
      data.county = this.state.steps.county.data;
    }

    if (this.state.steps.neighborhood.success && this.state.steps.neighborhood.data) {
      data.neighborhood = this.state.steps.neighborhood.data;
    }

    if (this.state.steps.propertyInfo.success && this.state.steps.propertyInfo.data) {
      data.propertyInfo = this.state.steps.propertyInfo.data;
    }

    // Phase 2 data
    if (this.state.steps.zillowSearch?.success && this.state.steps.zillowSearch.data) {
      data.zillowComps = this.state.steps.zillowSearch.data;
    }

    if (this.state.steps.interestRate?.success && this.state.steps.interestRate.data) {
      data.interestRate = this.state.steps.interestRate.data;
    }

    if (this.state.steps.propertyTax?.success && this.state.steps.propertyTax.data) {
      data.propertyTax = this.state.steps.propertyTax.data;
    }

    // Apartment comps - build object from all successful searches
    if (this.state.steps.apartmentComps) {
      const apartmentCompsData: { [key: string]: any } = {};
      Object.entries(this.state.steps.apartmentComps).forEach(([key, step]) => {
        if (step.success && step.data) {
          apartmentCompsData[key] = step.data;
        }
      });
      if (Object.keys(apartmentCompsData).length > 0) {
        data.apartmentComps = apartmentCompsData;
      }
    }

    // Collect all step details from both phases
    const stepDetails: any[] = [];

    // Add Phase 1 steps
    Object.values(this.state.steps).forEach(step => {
      if (step && typeof step === 'object' && 'stepName' in step) {
        stepDetails.push(step);
      }
    });

    // Add apartment comp steps
    if (this.state.steps.apartmentComps) {
      Object.values(this.state.steps.apartmentComps).forEach(step => {
        if (step.stepName) {
          stepDetails.push(step);
        }
      });
    }

    return {
      success: completedSteps.length > 0,
      completedSteps,
      failedSteps,
      ...(skippedSteps.length > 0 && { skippedSteps }),
      data,
      metadata: {
        totalApiCalls: this.state.metadata.totalApiCalls,
        totalExecutionTime,
        workflowStartTime,
        workflowEndTime,
        isMetroArea,
        stepDetails
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