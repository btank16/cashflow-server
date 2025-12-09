/**
 * AWS CDK Resource Configuration for New Rental Workflow Lambda (Python)
 * Uses ThreadPoolExecutor for parallel operations
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineFunction } from '@aws-amplify/backend';
import { DockerImage, Duration } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const newRentalWorkflow = defineFunction(
  (scope) => {
    const lambdaFunction = new Function(scope, 'newRentalWorkflow', {
      handler: 'index.handler',
      runtime: Runtime.PYTHON_3_12,
      timeout: Duration.seconds(540),
      memorySize: 512,
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

    // Environment variable for WorkflowJob DynamoDB table (will be set by backend.ts)
    // This is a placeholder - the actual table name will be injected during deployment
    lambdaFunction.addEnvironment('WORKFLOW_JOB_TABLE_NAME', '');

    // Grant Lambda permission to read all required SSM parameters
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI`,
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/GeminiAPI`,
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/RentCastAPI`,
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

    return lambdaFunction;
  }
);
