import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Stack } from 'aws-cdk-lib';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data
});

// Get all stacks from the backend
const stacks: Stack[] = [];

// Add auth and data stacks
if (backend.auth?.stack) {
  stacks.push(backend.auth.stack);
}
if (backend.data?.stack) {
  stacks.push(backend.data.stack);
}

// Also check for any additional function stacks that might be added directly
Object.values(backend).forEach((resource: any) => {
  if (resource?.stack && resource.stack instanceof Stack) {
    if (!stacks.includes(resource.stack)) {
      stacks.push(resource.stack);
    }
  }
});

// Update all Lambda functions in all stacks to use Node.js 22.x
stacks.forEach(stack => {
  stack.node.findAll().forEach((node) => {
    if (node instanceof NodejsFunction) {
      const cfnFunction = node.node.defaultChild as any;
      if (cfnFunction && cfnFunction.addPropertyOverride) {
        cfnFunction.addPropertyOverride('Runtime', Runtime.NODEJS_22_X.name);
      }
    }
  });
});
