import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { AppSyncResolverEvent } from 'aws-lambda';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variable set by backend.ts
const WORKFLOW_JOB_TABLE = process.env.WORKFLOW_JOB_TABLE_NAME || '';

interface GetStatusArgs {
  jobId: string;
}

interface WorkflowStatusResponse {
  jobId: string | null;
  status: string | null;
  currentStep: string | null;
  completedSteps: string[] | null;
  result: any | null;
  metadata: any | null;
  error: string | null;
}

export const handler = async (
  event: AppSyncResolverEvent<GetStatusArgs>
): Promise<WorkflowStatusResponse> => {
  console.log('getRentalWorkflowStatus invoked');

  try {
    const { jobId } = event.arguments;

    // Security: Require authenticated user - no anonymous fallback
    const userId = (event.identity as any)?.sub ||
                   (event.identity as any)?.claims?.sub;

    if (!userId) {
      console.error('Authentication required - no user ID found');
      return {
        jobId,
        status: 'failed',
        currentStep: null,
        completedSteps: null,
        result: null,
        metadata: null,
        error: 'Authentication required'
      };
    }

    console.log(`Fetching job ${jobId}`);
    console.log('Using table:', WORKFLOW_JOB_TABLE);

    // Get job record from DynamoDB
    const result = await docClient.send(new GetCommand({
      TableName: WORKFLOW_JOB_TABLE,
      Key: { id: jobId }
    }));

    if (!result.Item) {
      console.log('Job not found:', jobId);
      return {
        jobId,
        status: 'not_found',
        currentStep: null,
        completedSteps: null,
        result: null,
        metadata: null,
        error: 'Job not found'
      };
    }

    const job = result.Item;

    // Verify the job belongs to the requesting user (defense-in-depth)
    // Check both 'owner' (Amplify convention) and 'user_id' (our custom field)
    if (job.owner !== userId && job.user_id !== userId) {
      console.warn('Unauthorized access attempt for job:', jobId);
      return {
        jobId,
        status: 'unauthorized',
        currentStep: null,
        completedSteps: null,
        result: null,
        metadata: null,
        error: 'Unauthorized'
      };
    }

    console.log('Job found:', {
      status: job.status,
      currentStep: job.current_step
    });

    // Parse JSON strings from DynamoDB back to objects for AppSync
    // a.json() fields are stored as JSON strings in DynamoDB
    const parseJsonField = (field: any) => {
      if (!field) return null;
      if (typeof field === 'string') {
        try {
          return JSON.parse(field);
        } catch {
          return field;
        }
      }
      return field;
    };

    return {
      jobId: job.id,
      status: job.status,
      currentStep: job.current_step,
      completedSteps: parseJsonField(job.completed_steps) || [],
      result: parseJsonField(job.result),
      metadata: parseJsonField(job.metadata),
      error: job.error
    };

  } catch (error) {
    console.error('Error getting workflow status:', error);
    return {
      jobId: event.arguments.jobId,
      status: 'error',
      currentStep: null,
      completedSteps: null,
      result: null,
      metadata: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};
