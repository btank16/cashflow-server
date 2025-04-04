import {
    CognitoIdentityProviderClient,
    AdminAddUserToGroupCommand
} from '@aws-sdk/client-cognito-identity-provider';
import type { PreSignUpTriggerEvent } from 'aws-lambda';

const client = new CognitoIdentityProviderClient();
const GROUP_NAME = 'basic';

// The event structure is similar across Cognito triggers
export const handler = async (event: PreSignUpTriggerEvent) => {
    try {
        const command = new AdminAddUserToGroupCommand({
            GroupName: GROUP_NAME,
            Username: event.userName,
            UserPoolId: event.userPoolId
        });

        const response = await client.send(command);
        console.log(`User ${event.userName} added to ${GROUP_NAME} group at signup, requestId: ${response.$metadata.requestId}`);
    } catch (error) {
        console.error('Error adding user to group:', error);
        // Don't throw the error to prevent signup from failing
    }

    // Always return the event to continue the flow
    return event;
}; 