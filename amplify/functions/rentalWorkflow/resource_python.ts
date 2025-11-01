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
import * as ssm from 'aws-cdk-lib/aws-ssm';

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

    // Reference existing Amplify secrets from SSM Parameter Store
    // Amplify's secret() function creates SSM parameters with this naming pattern
    const perplexityParam = ssm.StringParameter.fromStringParameterName(
      scope,
      'PerplexityParam',
      '/amplify/shared/d1yieg8lf5bsxx/PerplexityAPI'
    );
    const apifyParam = ssm.StringParameter.fromStringParameterName(
      scope,
      'ApifyParam',
      '/amplify/shared/d1yieg8lf5bsxx/ApifyAPI'
    );

    // Grant read access to parameters
    perplexityParam.grantRead(lambdaFunction);
    apifyParam.grantRead(lambdaFunction);

    // Add environment variables with parameter values
    lambdaFunction.addEnvironment('PERPLEXITY_API_KEY', perplexityParam.stringValue);
    lambdaFunction.addEnvironment('APIFY_API_KEY', apifyParam.stringValue);

    return lambdaFunction;
  },
  { resourceGroupName: 'workflows' }
);
