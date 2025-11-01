/**
 * AWS CDK Resource Configuration for Rental Workflow Lambda (Python)
 * Defines the Python Lambda function and its configuration
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineFunction } from '@aws-amplify/backend';
import { DockerImage, Duration } from 'aws-cdk-lib';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const rentalWorkflow = defineFunction(
  (scope) => {
    const lambdaFunction = new Function(scope, 'rentalWorkflow', {
      handler: 'handler.handler',
      runtime: Runtime.PYTHON_3_12,
      timeout: Duration.seconds(180), // 3 minutes timeout for workflow execution
      memorySize: 512, // 512 MB memory for handling multiple API calls
      architecture: Architecture.ARM_64,
      code: Code.fromAsset(functionDir, {
        bundling: {
          image: DockerImage.fromRegistry('dummy'),
          local: {
            tryBundle(outputDir: string) {
              // Install Python dependencies
              execSync(
                `python3 -m pip install -r ${path.join(functionDir, 'requirements.txt')} -t ${outputDir}`,
                { stdio: 'inherit' }
              );

              // Copy all Python files from rentalWorkflow directory
              execSync(`cp ${path.join(functionDir, '*.py')} ${outputDir}`, {
                stdio: 'inherit',
              });

              // Copy the entire propertyDataGather module
              const propertyDataGatherDir = path.join(
                functionDir,
                '..',
                'propertyDataGather'
              );
              execSync(`cp -r ${propertyDataGatherDir} ${outputDir}`, {
                stdio: 'inherit',
              });

              return true;
            },
          },
        },
      }),
    });

    // Store parameter names as environment variables (not the actual values)
    // Lambda will read the actual SecureString values from SSM at runtime
    lambdaFunction.addEnvironment('PERPLEXITY_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI');
    lambdaFunction.addEnvironment('APIFY_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/ApifyAPI');

    // Grant Lambda permission to read SSM parameters at runtime
    lambdaFunction.addToRolePolicy(
      new (require('aws-cdk-lib/aws-iam').PolicyStatement)({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI`,
          `arn:aws:ssm:*:*:parameter/amplify/shared/d1yieg8lf5bsxx/ApifyAPI`,
        ],
      })
    );

    return lambdaFunction;
  },
  { resourceGroupName: 'workflows' }
);
