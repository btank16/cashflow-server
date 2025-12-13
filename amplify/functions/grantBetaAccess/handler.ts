/**
 * Grant Beta Access Handler
 * Adds a user to the beta Cognito group by email
 */

import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
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

interface GrantAccessResponse {
  success: boolean;
  message: string;
  userId: string | null;
}

export const handler = async (event: LambdaEvent): Promise<GrantAccessResponse> => {
  console.log('grantBetaAccess invoked');
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
      userId: null,
    };
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    console.log(`Granting beta access to: ${normalizedEmail}`);

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
        userId: null,
      };
    }

    const user = Users[0];
    const userId = user.Attributes?.find((a) => a.Name === 'sub')?.Value || null;

    // Add to beta group
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: user.Username!,
        GroupName: COGNITO_GROUPS.BETA,
      })
    );

    console.log(`Beta access granted to ${normalizedEmail} (${userId})`);

    return {
      success: true,
      message: `Beta access granted to ${normalizedEmail}`,
      userId,
    };
  } catch (error: any) {
    console.error('Error granting access:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      userId: null,
    };
  }
};
