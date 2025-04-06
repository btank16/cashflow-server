// import { PreSignUpTriggerEvent } from 'aws-lambda';
// import {
//     CognitoIdentityProviderClient,
//     AdminAddUserToGroupCommand
// } from '@aws-sdk/client-cognito-identity-provider';

// const GROUP_NAME = 'basic';

// /**
//  * Pre-signup Lambda trigger to add users to the basic group
//  * Supports Node.js v22 and Amplify Gen2
//  */
// export const handler = async (event: PreSignUpTriggerEvent) => {
//     try {
//         // Instantiate client inside handler for better cold start performance in modern Node.js
//         const client = new CognitoIdentityProviderClient();

//         const command = new AdminAddUserToGroupCommand({
//             GroupName: GROUP_NAME,
//             Username: event.userName,
//             UserPoolId: event.userPoolId
//         });

//         await client.send(command);
//         console.log(`User ${event.userName} added to ${GROUP_NAME} group at signup`);
//     } catch (error) {
//         console.error('Error adding user to group:', error);
//         // Don't throw error to prevent signup from failing
//     }

//     return event;
// }; 