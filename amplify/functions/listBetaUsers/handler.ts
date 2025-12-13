/**
 * List Beta Users Handler
 * Lists all users in the beta Cognito group
 */

import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { isAdmin, extractCognitoGroups, LambdaEventIdentity } from '../shared/authorization';
import { COGNITO_GROUPS } from '../shared/tiers';

const cognito = new CognitoIdentityProviderClient({});

interface LambdaEvent {
  arguments: Record<string, never>;
  identity: LambdaEventIdentity;
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

export const handler = async (event: LambdaEvent): Promise<ListUsersResponse> => {
  console.log('listBetaUsers invoked');
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
};
