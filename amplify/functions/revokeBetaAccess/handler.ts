/**
 * Revoke Beta Access Handler
 * Removes a user from the beta Cognito group by email
 */

import {
  CognitoIdentityProviderClient,
  AdminRemoveUserFromGroupCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { isAdmin, extractCognitoGroups, LambdaEventIdentity } from '../shared/authorization';
import { COGNITO_GROUPS } from '../shared/tiers';

const cognito = new CognitoIdentityProviderClient({});

interface LambdaEvent {
  arguments: {
    email: string;
  };
  identity: LambdaEventIdentity;
}

interface RevokeAccessResponse {
  success: boolean;
  message: string;
}

export const handler = async (event: LambdaEvent): Promise<RevokeAccessResponse> => {
  console.log('revokeBetaAccess invoked');
  console.log('Event:', JSON.stringify(event, null, 2));

  const cognitoGroups = extractCognitoGroups(event.identity);
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  if (!userPoolId) {
    console.error('COGNITO_USER_POOL_ID environment variable not set');
    throw new Error('Server configuration error');
  }

  // Verify caller is an admin
  if (!isAdmin(cognitoGroups)) {
    console.warn('Unauthorized admin access attempt');
    throw new Error('Unauthorized: Admin access required');
  }

  const email = event.arguments?.email;
  if (!email) {
    return {
      success: false,
      message: 'Email is required',
    };
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`Revoking beta access from: ${normalizedEmail}`);

    // Find user by email
    const { Users } = await cognito.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email = "${normalizedEmail}"`,
        Limit: 1,
      })
    );

    if (!Users || Users.length === 0) {
      console.log(`No user found with email: ${normalizedEmail}`);
      return {
        success: false,
        message: `No user found with email: ${normalizedEmail}`,
      };
    }

    // Remove from beta group
    await cognito.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: Users[0].Username!,
        GroupName: COGNITO_GROUPS.BETA,
      })
    );

    console.log(`Beta access revoked for ${normalizedEmail}`);

    return {
      success: true,
      message: `Beta access revoked for ${normalizedEmail}`,
    };
  } catch (error: any) {
    console.error('Error revoking access:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
};
