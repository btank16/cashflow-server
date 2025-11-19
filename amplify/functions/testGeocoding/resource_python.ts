/**
 * AWS CDK Resource Configuration for Test Geocoding Lambda (Python)
 * Simple test function for geocoding functionality
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineFunction } from '@aws-amplify/backend';
import { DockerImage, Duration } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const testGeocoding = defineFunction(
  (scope) => {
    const lambdaFunction = new Function(scope, 'testGeocoding', {
      handler: 'index.handler',
      runtime: Runtime.PYTHON_3_12,
      timeout: Duration.seconds(30),
      memorySize: 256,
      code: Code.fromAsset(functionDir, {
        bundling: {
          image: DockerImage.fromRegistry('dummy'),
          local: {
            tryBundle(outputDir: string) {
              // Copy function files first
              execSync(`cp ${path.join(functionDir, '*.py')} ${outputDir}/`, { stdio: 'inherit' });
              execSync(`cp ${path.join(functionDir, 'requirements.txt')} ${outputDir}/`, { stdio: 'inherit' });

              // Copy only the necessary parts of propertyDataGather module
              const propertyDataGatherDir = path.join(functionDir, '..', 'propertyDataGather');

              // Create the directory structure
              execSync(`mkdir -p ${path.join(outputDir, 'propertyDataGather/common')}`, { stdio: 'inherit' });
              execSync(`mkdir -p ${path.join(outputDir, 'propertyDataGather/functions')}`, { stdio: 'inherit' });

              // Copy only the specific files needed (no __init__.py files to avoid unwanted imports)
              // Copy common utilities (types and utils only, not the __init__.py)
              execSync(`cp ${path.join(propertyDataGatherDir, 'common/types.py')} ${path.join(outputDir, 'propertyDataGather/common/')}`, { stdio: 'inherit' });
              execSync(`cp ${path.join(propertyDataGatherDir, 'common/utils.py')} ${path.join(outputDir, 'propertyDataGather/common/')}`, { stdio: 'inherit' });

              // Copy the geocoding function
              execSync(`cp ${path.join(propertyDataGatherDir, 'functions/geocoding.py')} ${path.join(outputDir, 'propertyDataGather/functions/')}`, { stdio: 'inherit' });

              // Create minimal __init__.py files to make them proper Python packages
              execSync(`echo "" > ${path.join(outputDir, 'propertyDataGather/__init__.py')}`, { stdio: 'inherit' });
              execSync(`echo "" > ${path.join(outputDir, 'propertyDataGather/common/__init__.py')}`, { stdio: 'inherit' });
              execSync(`echo "" > ${path.join(outputDir, 'propertyDataGather/functions/__init__.py')}`, { stdio: 'inherit' });

              // Install Python dependencies for Lambda x86_64 environment
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

    return lambdaFunction;
  }
);
