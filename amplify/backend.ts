import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { newRentalWorkflow } from './functions/newRentalWorkflow/resource_python';
import { testGeocoding } from './functions/testGeocoding/resource_python';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  newRentalWorkflow,
  testGeocoding
});

