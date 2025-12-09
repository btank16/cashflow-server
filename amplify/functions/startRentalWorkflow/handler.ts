import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { randomUUID } from 'crypto';
import type { AppSyncResolverEvent } from 'aws-lambda';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({});

// Environment variables set by backend.ts
const WORKFLOW_JOB_TABLE = process.env.WORKFLOW_JOB_TABLE_NAME || '';
const WORKFLOW_LAMBDA_NAME = process.env.WORKFLOW_LAMBDA_NAME || '';

interface StartWorkflowArgs {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface StartWorkflowResponse {
  jobId: string | null;
  status: string | null;
  error: string | null;
}

// Input validation constants
const MAX_INPUT_LENGTH = 200;

export const handler = async (
  event: AppSyncResolverEvent<StartWorkflowArgs>
): Promise<StartWorkflowResponse> => {
  console.log('startRentalWorkflow invoked');

  try {
    const { street, city, state, zip } = event.arguments;

    // Security: Require authenticated user - no anonymous fallback
    const userId = (event.identity as any)?.sub ||
                   (event.identity as any)?.claims?.sub;

    if (!userId) {
      console.error('Authentication required - no user ID found');
      return {
        jobId: null,
        status: 'failed',
        error: 'Authentication required'
      };
    }

    // Security: Input length validation
    if (street.length > MAX_INPUT_LENGTH ||
        city.length > MAX_INPUT_LENGTH ||
        state.length > MAX_INPUT_LENGTH ||
        zip.length > MAX_INPUT_LENGTH) {
      console.error('Input validation failed: input exceeds maximum length');
      return {
        jobId: null,
        status: 'failed',
        error: 'Input exceeds maximum allowed length'
      };
    }

    // Generate unique job ID using Node.js native crypto (no external dependency)
    const jobId = randomUUID();
    const now = new Date().toISOString();

    // Create job record in DynamoDB
    // Note: 'owner' field is required for Amplify's owner-based authorization
    const jobRecord = {
      id: jobId,
      owner: userId,  // Required for allow.owner() authorization
      user_id: userId,
      status: 'pending',
      current_step: 'queued',
      completed_steps: [],
      input: { street, city, state, zip },
      result: null,
      metadata: null,
      error: null,
      createdAt: now,
      updatedAt: now
    };

    console.log('Creating job record:', { jobId, status: 'pending' });
    console.log('Using table:', WORKFLOW_JOB_TABLE);

    await docClient.send(new PutCommand({
      TableName: WORKFLOW_JOB_TABLE,
      Item: jobRecord
    }));

    console.log('Job record created, invoking workflow Lambda...');

    // Invoke the workflow Lambda asynchronously
    const invokeCommand = new InvokeCommand({
      FunctionName: WORKFLOW_LAMBDA_NAME,
      InvocationType: 'Event', // Async invocation
      Payload: Buffer.from(JSON.stringify({
        arguments: { street, city, state, zip },
        jobId: jobId,
        userId: userId
      }))
    });

    await lambdaClient.send(invokeCommand);
    console.log('Workflow Lambda invoked asynchronously');

    return {
      jobId,
      status: 'pending',
      error: null
    };

  } catch (error) {
    console.error('Error starting workflow:', error);
    return {
      jobId: null,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};
