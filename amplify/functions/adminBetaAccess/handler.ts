/**
 * Admin Beta Access Handler
 *
 * Handles admin operations for managing beta user access:
 * - grantBetaAccess: Add user to beta Cognito group
 * - revokeBetaAccess: Remove user from beta Cognito group
 * - listBetaUsers: List all users in beta group
 */

import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  ListUsersInGroupCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { isAdmin, extractCognitoGroups, LambdaEventIdentity } from '../shared/authorization';
import { COGNITO_GROUPS } from '../shared/tiers';

const cognito = new CognitoIdentityProviderClient({});

interface LambdaEvent {
  arguments: {
    email?: string;
  };
  identity: LambdaEventIdentity;
  info: {
    fieldName: string;
  };
}

interface GrantAccessResponse {
  success: boolean;
  message: string;
  userId: string | null;
}

interface RevokeAccessResponse {
  success: boolean;
  message: string;
}

interface BetaUser {
  email: string;
  userId: string;
  username: string;
  dateAdded: string;
}

interface ListUsersResponse {
  users: BetaUser[];
}

export const handler = async (
  event: LambdaEvent
): Promise<GrantAccessResponse | RevokeAccessResponse | ListUsersResponse> => {
  const { fieldName } = event.info;
  const cognitoGroups = extractCognitoGroups(event.identity);
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  console.log(`adminBetaAccess invoked: ${fieldName}`);

  if (!userPoolId) {
    console.error('COGNITO_USER_POOL_ID environment variable not set');
    throw new Error('Server configuration error');
  }

  // Verify caller is an admin
  if (!isAdmin(cognitoGroups)) {
    console.warn('Unauthorized admin access attempt');
    throw new Error('Unauthorized: Admin access required');
  }

  switch (fieldName) {
    case 'grantBetaAccess':
      return grantAccess(userPoolId, event.arguments.email!);
    case 'revokeBetaAccess':
      return revokeAccess(userPoolId, event.arguments.email!);
    case 'listBetaUsers':
      return listBetaUsers(userPoolId);
    default:
      throw new Error(`Unknown operation: ${fieldName}`);
  }
};

async function grantAccess(
  userPoolId: string,
  email: string
): Promise<GrantAccessResponse> {
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
}

async function revokeAccess(
  userPoolId: string,
  email: string
): Promise<RevokeAccessResponse> {
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
}

async function listBetaUsers(userPoolId: string): Promise<ListUsersResponse> {
  try {
    console.log('Listing beta users');

    const { Users } = await cognito.send(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: COGNITO_GROUPS.BETA,
      })
    );

    const users: BetaUser[] = (Users || []).map((user) => ({
      email: user.Attributes?.find((a) => a.Name === 'email')?.Value || '',
      userId: user.Attributes?.find((a) => a.Name === 'sub')?.Value || '',
      username: user.Username || '',
      dateAdded: user.UserCreateDate?.toISOString() || '',
    }));

    console.log(`Found ${users.length} beta users`);

    return { users };
  } catch (error: any) {
    console.error('Error listing beta users:', error);
    return { users: [] };
  }
}
