import { defineFunction } from '@aws-amplify/backend';

export const postSignup = defineFunction({
    name: 'post-signup',
    resourceGroupName: 'auth'
}); 