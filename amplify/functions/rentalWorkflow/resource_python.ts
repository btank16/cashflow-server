/**
 * AWS CDK Resource Configuration for Rental Workflow Lambda (Python)
 * Defines the Python Lambda function and its configuration
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineFunction } from '@aws-amplify/backend';
import { DockerImage, Duration, Stack } from 'aws-cdk-lib';
import { Architecture, Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

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

    // Reference secrets from AWS Secrets Manager
    // These should match the secret names defined in Amplify backend
    const perplexitySecret = secretsmanager.Secret.fromSecretNameV2(
      scope,
      'PerplexitySecret',
      'PerplexityAPI'
    );
    const apifySecret = secretsmanager.Secret.fromSecretNameV2(
      scope,
      'ApifySecret',
      'ApifyAPI'
    );

    // Grant read access to secrets
    perplexitySecret.grantRead(lambdaFunction);
    apifySecret.grantRead(lambdaFunction);

    // Add environment variables with secret ARNs
    lambdaFunction.addEnvironment('PERPLEXITY_API_KEY', perplexitySecret.secretValue.unsafeUnwrap());
    lambdaFunction.addEnvironment('APIFY_API_KEY', apifySecret.secretValue.unsafeUnwrap());

    return lambdaFunction;
  },
  { resourceGroupName: 'workflows' }
);
