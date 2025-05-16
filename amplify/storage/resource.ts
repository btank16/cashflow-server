import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
    name: 'cashflowBucket',
    access: (allow) => ({
        'terms/*': [
            allow.guest.to(['read']) // anyone can read terms and conditions
        ]
    })
});