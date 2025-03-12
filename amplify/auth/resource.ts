import { defineAuth, secret } from "@aws-amplify/backend";
// import { secret } from "@aws-amplify/backend-shared";

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    //Configure social providers
    externalProviders: {
      google: {
        clientId: secret('GoogleClientID'),
        clientSecret: secret('GoogleClientSecret'),
        scopes: ['email', 'given_name', 'family_name'],
        attributeMapping: {
          email: 'email',
          givenName: 'given_name',
          familyName: 'family_name',
        },
      },
      //   signInWithApple: {
      //     clientId: secret('APPLE_CLIENT_ID'),
      //     teamId: secret('APPLE_TEAM_ID'),
      //     keyId: secret('APPLE_KEY_ID'),
      //     privateKey: secret('APPLE_PRIVATE_KEY'),
      //   }
      callbackUrls: ["cashflow://"],
      logoutUrls: ["cashflow://"],
    }
  },
  // Configure user attributes
  userAttributes: {
    // Standard attributes
    givenName: {
      required: true,
      mutable: true,
    },
    familyName: {
      required: true,
      mutable: true,
    },
    // Custom attributes
    "custom:origin_state": {
      mutable: true,
      dataType: "String",
    },
    "custom:interest_state": {
      mutable: true,
      dataType: "String",
    },
    "custom:terms": {
      mutable: false,
      dataType: "Boolean",
    },
    "custom:email_updates": {
      mutable: true,
      dataType: "Boolean",
    },
    "custom:invest_strategy": {
      mutable: true,
      dataType: "String",
    },
  }
});
