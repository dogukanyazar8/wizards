import { MobileApiError } from "../api/mobile-api-client";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";

export function getMobilePasswordSignInFailure(error: unknown) {
  const serverCode = error instanceof MobileApiError ? error.serverCode : null;

  return {
    message:
      serverCode === "TWO_FACTOR_INVALID"
        ? activeMobileCopy.authTwoFactorInvalidCode
        : activeMobileCopy.authInvalidCredentials,
    requiresTwoFactor: serverCode === "TWO_FACTOR_REQUIRED",
  };
}

export function getMobileGoogleSignInFailure(error: unknown) {
  const serverCode = error instanceof MobileApiError ? error.serverCode : null;

  return {
    message:
      serverCode === "TWO_FACTOR_REQUIRED"
        ? activeMobileCopy.authTwoFactorRequiredNotice
        : serverCode === "TWO_FACTOR_INVALID"
          ? activeMobileCopy.authTwoFactorInvalidCode
          : activeMobileCopy.authSocialSignInFailed,
    requiresTwoFactor: serverCode === "TWO_FACTOR_REQUIRED" || serverCode === "TWO_FACTOR_INVALID",
  };
}
