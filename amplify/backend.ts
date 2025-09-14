import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data
});

// Access the existing stacks that contain your Lambda functions
const authStack = backend.auth.stack;
const dataStack = backend.data.stack;

// Update functions in each stack to use Node.js 22.x
[authStack, dataStack].forEach(stack => {
  stack.node.children.forEach((child) => {
    if (child instanceof NodejsFunction) {
      const cfnFunction = child.node.defaultChild as any;
      if (cfnFunction) {
        cfnFunction.addPropertyOverride('Runtime', Runtime.NODEJS_22_X.name);
      }
    }
  });
});
