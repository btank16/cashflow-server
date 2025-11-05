/**
 * AWS CDK Resource Configuration for Rental Workflow Lambda (Python)
 * Following AWS Amplify Gen 2 documentation pattern exactly
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
              // Following exact documentation pattern with path.join
              execSync(
                `python3 -m pip install -r ${path.join(functionDir, 'requirements.txt')} -t ${path.join(outputDir)} --platform manylinux2014_x86_64 --only-binary=:all:`,
                { stdio: 'inherit' }
              );

              // Copy all files from function directory (as per documentation)
              execSync(`cp -r ${functionDir}/* ${path.join(outputDir)}`, { stdio: 'inherit' });

              // Additionally copy the propertyDataGather module
              const propertyDataGatherDir = path.join(functionDir, '..', 'propertyDataGather');
              execSync(`cp -r ${propertyDataGatherDir} ${path.join(outputDir)}/propertyDataGather`, { stdio: 'inherit' });

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
