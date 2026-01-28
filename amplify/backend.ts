import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { newRentalWorkflow } from './functions/newRentalWorkflow/resource_python';
import { startRentalWorkflow } from './functions/startRentalWorkflow/resource';
import { getRentalWorkflowStatus } from './functions/getRentalWorkflowStatus/resource';
import { getEntitlements } from './functions/getEntitlements/resource';
import { grantBetaAccess } from './functions/grantBetaAccess/resource';
import { revokeBetaAccess } from './functions/revokeBetaAccess/resource';
import { listBetaUsers } from './functions/listBetaUsers/resource';
import { interestRateLookup } from './functions/interestRateLookup/resource';
import { geminiArticles } from './functions/geminiArticles/resource';
import { offerLetter } from './functions/offerLetter/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  newRentalWorkflow,
  startRentalWorkflow,
  getRentalWorkflowStatus,
  getEntitlements,
  grantBetaAccess,
  revokeBetaAccess,
  listBetaUsers,
  interestRateLookup,
  geminiArticles,
  offerLetter,
});

// =============================================================================
// Table References
// =============================================================================
const workflowJobTable = backend.data.resources.tables['WorkflowJob'];
const usageRecordTable = backend.data.resources.tables['UsageRecord'];
const rateLimitCounterTable = backend.data.resources.tables['RateLimitCounter'];
const workflowJobTableName = workflowJobTable.tableName;
const usageRecordTableName = usageRecordTable.tableName;
const rateLimitCounterTableName = rateLimitCounterTable.tableName;

// =============================================================================
// Lambda Function References
// =============================================================================
const newRentalWorkflowLambda = backend.newRentalWorkflow.resources.lambda as Function;
const startRentalWorkflowLambda = backend.startRentalWorkflow.resources.lambda as Function;
const getRentalWorkflowStatusLambda = backend.getRentalWorkflowStatus.resources.lambda as Function;
const getEntitlementsLambda = backend.getEntitlements.resources.lambda as Function;
const grantBetaAccessLambda = backend.grantBetaAccess.resources.lambda as Function;
const revokeBetaAccessLambda = backend.revokeBetaAccess.resources.lambda as Function;
const listBetaUsersLambda = backend.listBetaUsers.resources.lambda as Function;

const newRentalWorkflowFunctionName = newRentalWorkflowLambda.functionName;

// =============================================================================
// startRentalWorkflow Configuration
// =============================================================================
startRentalWorkflowLambda.addEnvironment('WORKFLOW_JOB_TABLE_NAME', workflowJobTableName);
startRentalWorkflowLambda.addEnvironment('WORKFLOW_LAMBDA_NAME', newRentalWorkflowFunctionName);
startRentalWorkflowLambda.addEnvironment('USAGE_TABLE_NAME', usageRecordTableName);

// Grant DynamoDB permissions
workflowJobTable.grantWriteData(startRentalWorkflowLambda);
usageRecordTable.grantReadWriteData(startRentalWorkflowLambda);

// Grant permission to invoke newRentalWorkflow Lambda
startRentalWorkflowLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [newRentalWorkflowLambda.functionArn]
  })
);

// =============================================================================
// getRentalWorkflowStatus Configuration
// =============================================================================
getRentalWorkflowStatusLambda.addEnvironment('WORKFLOW_JOB_TABLE_NAME', workflowJobTableName);
workflowJobTable.grantReadData(getRentalWorkflowStatusLambda);

// =============================================================================
// newRentalWorkflow (Python) Configuration
// =============================================================================
newRentalWorkflowLambda.addEnvironment('WORKFLOW_JOB_TABLE_NAME', workflowJobTableName);
newRentalWorkflowLambda.addEnvironment('RATE_LIMIT_TABLE_NAME', rateLimitCounterTableName);
workflowJobTable.grantReadWriteData(newRentalWorkflowLambda);
rateLimitCounterTable.grantReadWriteData(newRentalWorkflowLambda);

// =============================================================================
// getEntitlements Configuration
// =============================================================================
getEntitlementsLambda.addEnvironment('USAGE_TABLE_NAME', usageRecordTableName);
usageRecordTable.grantReadData(getEntitlementsLambda);

// =============================================================================
// Admin Beta Access Functions Configuration
// =============================================================================
const cognitoUserPoolId = backend.auth.resources.userPool.userPoolId;
const cognitoUserPoolArn = backend.auth.resources.userPool.userPoolArn;

// grantBetaAccess - needs to add users to groups
grantBetaAccessLambda.addEnvironment('COGNITO_USER_POOL_ID', cognitoUserPoolId);
grantBetaAccessLambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:ListUsers',
    ],
    resources: [cognitoUserPoolArn],
  })
);

// revokeBetaAccess - needs to remove users from groups
revokeBetaAccessLambda.addEnvironment('COGNITO_USER_POOL_ID', cognitoUserPoolId);
revokeBetaAccessLambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:ListUsers',
    ],
    resources: [cognitoUserPoolArn],
  })
);

// listBetaUsers - needs to list users in a group
listBetaUsersLambda.addEnvironment('COGNITO_USER_POOL_ID', cognitoUserPoolId);
listBetaUsersLambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:ListUsersInGroup',
    ],
    resources: [cognitoUserPoolArn],
  })
);

// =============================================================================
// S3 Storage Configuration
// =============================================================================
const bucket = backend.storage.resources.bucket;

// Add lifecycle rule to delete objects after 1 day (minimum allowed by S3)
const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.lifecycleConfiguration = {
  rules: [{
    id: 'DeleteTempPDFs',
    status: 'Enabled',
    expirationInDays: 1,
    prefix: 'pdfs/',
  }],
};
