import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { unitCount } from './functions/unit_count/resource';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  unitCount
});

// Access the existing stacks that contain your Lambda functions
const authStack = backend.auth.stack;
const dataStack = backend.data.stack;
const unitCountStack = backend.unitCount.stack;

// Update functions in each stack to use Node.js 22.x
[authStack, dataStack, unitCountStack].forEach(stack => {
  stack.node.children.forEach((child) => {
    if (child instanceof NodejsFunction) {
      const cfnFunction = child.node.defaultChild as any;
      if (cfnFunction) {
        cfnFunction.addPropertyOverride('Runtime', Runtime.NODEJS_22_X.name);
      }
    }
  });
});
