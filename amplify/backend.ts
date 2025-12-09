import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { newRentalWorkflow } from './functions/newRentalWorkflow/resource_python';
import { startRentalWorkflow } from './functions/startRentalWorkflow/resource';
import { getRentalWorkflowStatus } from './functions/getRentalWorkflowStatus/resource';
import { testGeocoding } from './functions/testGeocoding/resource_python';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  newRentalWorkflow,
  startRentalWorkflow,
  getRentalWorkflowStatus,
  testGeocoding
});

// Get the WorkflowJob table from the data stack
const workflowJobTable = backend.data.resources.tables['WorkflowJob'];
const workflowJobTableName = workflowJobTable.tableName;

// Get the newRentalWorkflow Lambda function (cast to Function for full API access)
const newRentalWorkflowLambda = backend.newRentalWorkflow.resources.lambda as Function;
const newRentalWorkflowFunctionName = newRentalWorkflowLambda.functionName;

// Configure startRentalWorkflow Lambda
const startRentalWorkflowLambda = backend.startRentalWorkflow.resources.lambda as Function;
startRentalWorkflowLambda.addEnvironment('WORKFLOW_JOB_TABLE_NAME', workflowJobTableName);
startRentalWorkflowLambda.addEnvironment('WORKFLOW_LAMBDA_NAME', newRentalWorkflowFunctionName);

// Grant startRentalWorkflow permission to write to DynamoDB
workflowJobTable.grantWriteData(startRentalWorkflowLambda);

// Grant startRentalWorkflow permission to invoke newRentalWorkflow Lambda
startRentalWorkflowLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [newRentalWorkflowLambda.functionArn]
  })
);

// Configure getRentalWorkflowStatus Lambda
const getRentalWorkflowStatusLambda = backend.getRentalWorkflowStatus.resources.lambda as Function;
getRentalWorkflowStatusLambda.addEnvironment('WORKFLOW_JOB_TABLE_NAME', workflowJobTableName);

// Grant getRentalWorkflowStatus permission to read from DynamoDB
workflowJobTable.grantReadData(getRentalWorkflowStatusLambda);

// Configure newRentalWorkflow (Python) - uses direct DynamoDB access
newRentalWorkflowLambda.addEnvironment('WORKFLOW_JOB_TABLE_NAME', workflowJobTableName);

// Grant newRentalWorkflow permission to read/write DynamoDB
workflowJobTable.grantReadWriteData(newRentalWorkflowLambda);
