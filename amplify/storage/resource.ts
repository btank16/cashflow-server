import { defineStorage } from '@aws-amplify/backend';

export const cashflowBucket = defineStorage({
    name: 'cashflowBucket',
    isDefault: true,
    access: (allow) => ({
        'terms/*': [
            allow.guest.to(['read']) //anyone can read terms and conditions
        ]
    })
});