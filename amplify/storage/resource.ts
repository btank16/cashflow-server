import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'tempPdfStorage',
  access: (allow) => ({
    // Each authenticated user can upload/read/delete their own PDFs
    'pdfs/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete'])
    ],
  })
});
