/**
 * AWS CDK Resource Configuration for New Rental Workflow Lambda (Python)
 * Uses ThreadPoolExecutor for parallel operations
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineFunction } from '@aws-amplify/backend';
import { Aws, DockerImage, Duration } from 'aws-cdk-lib';
import { Code, Function, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const newRentalWorkflow = defineFunction(
  (scope) => {
    // AWS Lambda Powertools layer for Python
    // Provides parameters utility for SSM retrieval with caching
    const powertoolsLayer = LayerVersion.fromLayerVersionArn(
      scope,
      'PowertoolsLayer',
      `arn:aws:lambda:${Aws.REGION}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python312-x86_64:18`
    );

    const lambdaFunction = new Function(scope, 'newRentalWorkflow', {
      handler: 'index.handler',
      runtime: Runtime.PYTHON_3_12,
      timeout: Duration.seconds(620),
      memorySize: 512,
      layers: [powertoolsLayer],
      code: Code.fromAsset(functionDir, {
        bundling: {
          image: DockerImage.fromRegistry('dummy'),
          local: {
            tryBundle(outputDir: string) {
              // Copy function files first (before installing dependencies)
              execSync(`cp ${path.join(functionDir, '*.py')} ${outputDir}/`, { stdio: 'inherit' });

              // Copy the propertyDataGather module (includes requirements.txt)
              const propertyDataGatherDir = path.join(functionDir, '..', 'propertyDataGather');
              execSync(`cp -r ${propertyDataGatherDir} ${path.join(outputDir)}/propertyDataGather`, { stdio: 'inherit' });

              // Install Python dependencies using propertyDataGather's requirements.txt
              // This ensures single source of truth for dependency versions
              const requirementsPath = path.join(outputDir, 'propertyDataGather', 'requirements.txt');
              execSync(
                `python3 -m pip install -r ${requirementsPath} -t ${outputDir} --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: --upgrade`,
                { stdio: 'inherit' }
              );

              return true;
            },
          },
        },
      }),
    });

    // Environment variables for SSM parameter names
    lambdaFunction.addEnvironment('PERPLEXITY_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI');
    lambdaFunction.addEnvironment('GEMINI_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/GeminiAPI');
    lambdaFunction.addEnvironment('RENTCAST_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/RentCastAPI');
    lambdaFunction.addEnvironment('GOOGLE_MAPS_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/GoogleMapsAPI');

    // Environment variable for WorkflowJob DynamoDB table (will be set by backend.ts)
    // This is a placeholder - the actual table name will be injected during deployment
    lambdaFunction.addEnvironment('WORKFLOW_JOB_TABLE_NAME', '');

    // Environment variable for RateLimitCounter DynamoDB table (will be set by backend.ts)
    // Used for distributed rate limiting across Lambda invocations
    lambdaFunction.addEnvironment('RATE_LIMIT_TABLE_NAME', '');

    // Grant Lambda permission to read all required SSM parameters
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI`,
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/GeminiAPI`,
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/RentCastAPI`,
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/GoogleMapsAPI`,
        ],
      })
    );

    // Grant Lambda permission to read/write WorkflowJob DynamoDB table
    // Using wildcard since exact table name is generated at deploy time
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:Query'
        ],
        resources: [
          `arn:aws:dynamodb:*:*:table/*WorkflowJob*`,
        ],
      })
    );

    // Grant Lambda permission to read/write RateLimitCounter DynamoDB table
    // Used for distributed rate limiting of external API calls
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem'
        ],
        resources: [
          `arn:aws:dynamodb:*:*:table/*RateLimitCounter*`,
        ],
      })
    );

    // Grant Lambda permission to use AWS Location Service v2 (geo-places) for geocoding
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['geo-places:Geocode'],
        resources: ['*'],  // geo-places v2 has no resource ARNs
      })
    );

    return lambdaFunction;
  },
  {
    resourceGroupName: 'data'
  }
);
