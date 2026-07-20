import { GoogleSignin } from "@react-native-google-signin/google-signin";

import type { MobileGoogleNativeSignInClient } from "./mobile-google-native-sign-in";

/**
 * Thin adapter over the native module. Every call is funnelled through
 * `runMobileGoogleNativeSignIn`, which treats a throwing client as "native path
 * unavailable" — that is what happens on a build that predates this module.
 */
export const mobileGoogleNativeSignInClient: MobileGoogleNativeSignInClient = {
  configure: ({ webClientId }) => {
    GoogleSignin.configure({
      // No offlineAccess: the app never needs a server auth code, only the ID
      // token that the API verifies against Google's JWKS.
      offlineAccess: false,
      scopes: ["email", "profile"],
      webClientId,
    });
  },
  hasPlayServices: () => GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }),
  signIn: () => GoogleSignin.signIn(),
  signOut: () => GoogleSignin.signOut(),
};
