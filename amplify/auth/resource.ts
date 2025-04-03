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
        scopes: ['email', 'profile', 'openid'],
        attributeMapping: {
          email: 'email',
        },
      },
      signInWithApple: {
        clientId: secret('AppleClientID'),
        teamId: secret('AppleTeamID'),
        keyId: secret('AppleKeyID'),
        privateKey: secret('ApplePrivateKey'),
        scopes: ['email', 'name'],
        attributeMapping: {
          email: 'email',
        },
      },
      callbackUrls: ["cashflow://", "exp://127.0.0.1:8081/", "exp://192.168.1.101:8081/"],
      logoutUrls: ["cashflow://", "exp://127.0.0.1:8081/", "exp://192.168.1.101:8081/"],
    }
  },
  // Configure user attributes
  userAttributes: {
    // Edited Standard attributes
    // Removed the standard givenName and familyName due to conflict with OAuth (Apple)
    "custom:firstName": {
      mutable: true,
      dataType: "String",
    },
    "custom:lastName": {
      mutable: true,
      dataType: "String",
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
      mutable: true,
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
  },
  // User groups
  groups: ["basic", "premium"]
});
