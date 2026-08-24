import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";

export const MOBILE_OAUTH_COMPLETE_PATH = "/mobile/oauth/complete";
export const MOBILE_OAUTH_START_PATH = "/mobile/oauth/start";

/** Only providers with a configured NextAuth provider may be started from mobile. */
export const MOBILE_OAUTH_SUPPORTED_PROVIDERS = ["google"] as const;
const MOBILE_OAUTH_STATE_PATTERN = /^[0-9a-f]{64}$/u;

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

export function getSafeMobileOAuthState(value: unknown): string | null {
  return typeof value === "string" && MOBILE_OAUTH_STATE_PATTERN.test(value) ? value : null;
}

export function buildMobileOAuthCompletePath(callbackUrl: string, state: string) {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl, "/messages");
  const safeState = getSafeMobileOAuthState(state);
  if (!safeState) {
    throw new Error("Invalid mobile OAuth state.");
  }
  return `${MOBILE_OAUTH_COMPLETE_PATH}?callbackUrl=${encodeURIComponent(
    safeCallbackUrl,
  )}&state=${safeState}`;
}

export function buildMobileOAuthStartPath(
  callbackUrl: string,
  provider: MobileOAuthProvider,
  state: string,
) {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl, "/messages");
  const safeState = getSafeMobileOAuthState(state);
  if (!safeState) {
    throw new Error("Invalid mobile OAuth state.");
  }
  return `${MOBILE_OAUTH_START_PATH}?callbackUrl=${encodeURIComponent(
    safeCallbackUrl,
  )}&provider=${encodeURIComponent(getSafeMobileOAuthProvider(provider))}&state=${safeState}`;
}

export function buildMobileOAuthHandoffUrl(token: string, callbackUrl: string, state: string) {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl, "/messages");
  const safeState = getSafeMobileOAuthState(state);
  if (!safeState) {
    throw new Error("Invalid mobile OAuth state.");
  }
  return `whispr://oauth/${encodeURIComponent(token)}?callbackUrl=${encodeURIComponent(
    safeCallbackUrl,
  )}&state=${safeState}`;
}
