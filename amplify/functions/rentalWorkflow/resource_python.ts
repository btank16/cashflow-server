/**
 * AWS CDK Resource Configuration for Rental Workflow Lambda (Python)
 * Following AWS Amplify Gen 2 documentation pattern 
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineFunction } from '@aws-amplify/backend';
import { DockerImage, Duration } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const rentalWorkflow = defineFunction(
  (scope) => {
    const lambdaFunction = new Function(scope, 'rentalWorkflow', {
      handler: 'index.handler',
      runtime: Runtime.PYTHON_3_12,
      timeout: Duration.seconds(300),
      memorySize: 512,
      code: Code.fromAsset(functionDir, {
        bundling: {
          image: DockerImage.fromRegistry('dummy'),
          local: {
            tryBundle(outputDir: string) {
              // Copy function files first (before installing dependencies)
              // This prevents dependencies from being overwritten by source files
              execSync(`cp ${path.join(functionDir, '*.py')} ${outputDir}/`, { stdio: 'inherit' });
              execSync(`cp ${path.join(functionDir, 'requirements.txt')} ${outputDir}/`, { stdio: 'inherit' });

              // Copy the propertyDataGather module
              const propertyDataGatherDir = path.join(functionDir, '..', 'propertyDataGather');
              execSync(`cp -r ${propertyDataGatherDir} ${path.join(outputDir)}/propertyDataGather`, { stdio: 'inherit' });

              // Install Python dependencies for Lambda x86_64 environment
              // Using pip with specific platform flags for Python 3.12
              execSync(
                `python3 -m pip install -r ${path.join(outputDir, 'requirements.txt')} -t ${outputDir} --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: --upgrade`,
                { stdio: 'inherit' }
              );

              return true;
            },
          },
        },
      }),
    });

    // Lambda will read the actual SecureString values from SSM at runtime
    lambdaFunction.addEnvironment('PERPLEXITY_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI');
    lambdaFunction.addEnvironment('APIFY_PARAM_NAME', '/amplify/shared/d1yieg8lf5bsxx/ApifyAPI');

    // Grant Lambda permission to read SSM parameters at runtime
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
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
