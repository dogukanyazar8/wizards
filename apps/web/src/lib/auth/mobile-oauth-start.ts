import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";

export const MOBILE_OAUTH_COMPLETE_PATH = "/mobile/oauth/complete";
export const MOBILE_OAUTH_START_PATH = "/mobile/oauth/start";

/** Only providers with a configured NextAuth provider may be started from mobile. */
export const MOBILE_OAUTH_SUPPORTED_PROVIDERS = ["google"] as const;

export type MobileOAuthProvider = (typeof MOBILE_OAUTH_SUPPORTED_PROVIDERS)[number];

export function getMobileOAuthGoogleAuthorizationParams() {
  return {
    prompt: "select_account",
  } as const;
}

export function getSafeMobileOAuthProvider(value: unknown): MobileOAuthProvider {
  const provider = MOBILE_OAUTH_SUPPORTED_PROVIDERS.find((supported) => supported === value);
  return provider ?? "google";
}

export function buildMobileOAuthCompletePath(callbackUrl: string) {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl, "/channels/@me");
  return `${MOBILE_OAUTH_COMPLETE_PATH}?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`;
}

export function buildMobileOAuthStartPath(callbackUrl: string, provider: MobileOAuthProvider) {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl, "/channels/@me");
  return `${MOBILE_OAUTH_START_PATH}?callbackUrl=${encodeURIComponent(
    safeCallbackUrl,
  )}&provider=${encodeURIComponent(getSafeMobileOAuthProvider(provider))}`;
}
