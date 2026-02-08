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
import { syncSubscription } from './functions/syncSubscription/resource';
import { revenueCatWebhook } from './functions/revenueCatWebhook/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

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
  syncSubscription,
  revenueCatWebhook,
});

// =============================================================================
// DynamoDB TTL Configuration
// =============================================================================
const { cfnResources } = backend.data.resources;

cfnResources.amplifyDynamoDbTables['RateLimitCounter'].timeToLiveAttribute = {
  attributeName: 'ttl',
  enabled: true,
};

cfnResources.amplifyDynamoDbTables['UsageRecord'].timeToLiveAttribute = {
  attributeName: 'ttl',
  enabled: true,
};

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
// Note: SUBSCRIPTION_TABLE_NAME is added in RevenueCat section below
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

// Add lifecycle rule to delete objects after 1 day
const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.addPropertyOverride('LifecycleConfiguration', {
  Rules: [{
    Id: 'DeleteTempPDFs',
    Status: 'Enabled',
    ExpirationInDays: 1,
    Prefix: 'pdfs/',
    AbortIncompleteMultipartUpload: {
      DaysAfterInitiation: 1,
    },
    ExpiredObjectDeleteMarker: true,
  }],
});

// =============================================================================
// RevenueCat Subscription Functions Configuration
// =============================================================================
const userSubscriptionTable = backend.data.resources.tables['UserSubscription'];
const userSubscriptionTableName = userSubscriptionTable.tableName;

// Add subscription table access to getEntitlements
getEntitlementsLambda.addEnvironment('SUBSCRIPTION_TABLE_NAME', userSubscriptionTableName);
userSubscriptionTable.grantReadData(getEntitlementsLambda);

const syncSubscriptionLambda = backend.syncSubscription.resources.lambda as Function;
const revenueCatWebhookLambda = backend.revenueCatWebhook.resources.lambda as Function;

// syncSubscription - needs Cognito, DynamoDB (subscription + usage) access
syncSubscriptionLambda.addEnvironment('COGNITO_USER_POOL_ID', cognitoUserPoolId);
syncSubscriptionLambda.addEnvironment('SUBSCRIPTION_TABLE_NAME', userSubscriptionTableName);
syncSubscriptionLambda.addEnvironment('USAGE_TABLE_NAME', usageRecordTableName);
userSubscriptionTable.grantReadWriteData(syncSubscriptionLambda);
usageRecordTable.grantReadWriteData(syncSubscriptionLambda);
syncSubscriptionLambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:AdminListGroupsForUser',
    ],
    resources: [cognitoUserPoolArn],
  })
);

// revenueCatWebhook - needs Cognito, DynamoDB (subscription + usage) access
revenueCatWebhookLambda.addEnvironment('COGNITO_USER_POOL_ID', cognitoUserPoolId);
revenueCatWebhookLambda.addEnvironment('SUBSCRIPTION_TABLE_NAME', userSubscriptionTableName);
revenueCatWebhookLambda.addEnvironment('USAGE_TABLE_NAME', usageRecordTableName);
userSubscriptionTable.grantReadWriteData(revenueCatWebhookLambda);
usageRecordTable.grantReadWriteData(revenueCatWebhookLambda);
revenueCatWebhookLambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminAddUserToGroup',
      'cognito-idp:AdminRemoveUserFromGroup',
      'cognito-idp:AdminListGroupsForUser',
      'cognito-idp:ListUsers',
    ],
    resources: [cognitoUserPoolArn],
  })
);

// Create API Gateway for RevenueCat webhook
// This exposes a public HTTPS endpoint for RevenueCat to call
const webhookApi = new apigateway.LambdaRestApi(
  backend.revenueCatWebhook.resources.lambda.stack,
  'RevenueCatWebhookApi',
  {
    handler: revenueCatWebhookLambda,
    proxy: true,
    deployOptions: {
      stageName: 'prod',
    },
  }
);

// Output the webhook URL for configuration in RevenueCat dashboard
backend.addOutput({
  custom: {
    revenueCatWebhookUrl: webhookApi.url,
  },
});
