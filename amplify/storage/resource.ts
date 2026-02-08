import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'tempPdfStorage',
  access: (allow) => ({
    // All authenticated users can access PDFs
    // allow.authenticated covers default authenticated role
    // allow.groups covers users in Cognito groups (who use group-specific IAM roles)
    'pdfs/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
      allow.groups(['basic', 'premium', 'platinum', 'beta', 'admin']).to(['read', 'write', 'delete'])
    ],
  })
});
