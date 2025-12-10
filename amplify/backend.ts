import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { newRentalWorkflow } from './functions/newRentalWorkflow/resource_python';
import { startRentalWorkflow } from './functions/startRentalWorkflow/resource';
import { getRentalWorkflowStatus } from './functions/getRentalWorkflowStatus/resource';
import { testGeocoding } from './functions/testGeocoding/resource_python';
import { adminBetaAccess } from './functions/adminBetaAccess/resource';
import { getEntitlements } from './functions/getEntitlements/resource';
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
  testGeocoding,
  adminBetaAccess,
  getEntitlements
});

// =============================================================================
// Table References
// =============================================================================
const workflowJobTable = backend.data.resources.tables['WorkflowJob'];
const usageRecordTable = backend.data.resources.tables['UsageRecord'];
const workflowJobTableName = workflowJobTable.tableName;
const usageRecordTableName = usageRecordTable.tableName;

// =============================================================================
// Lambda Function References
// =============================================================================
const newRentalWorkflowLambda = backend.newRentalWorkflow.resources.lambda as Function;
const startRentalWorkflowLambda = backend.startRentalWorkflow.resources.lambda as Function;
const getRentalWorkflowStatusLambda = backend.getRentalWorkflowStatus.resources.lambda as Function;
const adminBetaAccessLambda = backend.adminBetaAccess.resources.lambda as Function;
const getEntitlementsLambda = backend.getEntitlements.resources.lambda as Function;

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
workflowJobTable.grantReadWriteData(newRentalWorkflowLambda);

// =============================================================================
// getEntitlements Configuration
// =============================================================================
getEntitlementsLambda.addEnvironment('USAGE_TABLE_NAME', usageRecordTableName);
usageRecordTable.grantReadData(getEntitlementsLambda);

// =============================================================================
// adminBetaAccess Configuration
// =============================================================================
adminBetaAccessLambda.addEnvironment(
  'COGNITO_USER_POOL_ID',
  backend.auth.resources.userPool.userPoolId
);

// Grant Cognito permissions for managing user groups
adminBetaAccessLambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:ListUsersInGroup',
      'cognito-idp:ListUsers',
      'cognito-idp:AdminGetUser',
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);
