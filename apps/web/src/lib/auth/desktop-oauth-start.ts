import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";

export const DESKTOP_OAUTH_COMPLETE_PATH = "/desktop/oauth/complete";
export const DESKTOP_OAUTH_START_PATH = "/desktop/oauth/start";

export function getDesktopOAuthGoogleAuthorizationParams() {
  return {
    prompt: "select_account",
  } as const;
}

export function buildDesktopOAuthCompletePath(callbackUrl: string, attemptId?: string) {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl);
  return `${DESKTOP_OAUTH_COMPLETE_PATH}?callbackUrl=${encodeURIComponent(safeCallbackUrl)}${
    attemptId ? `&attempt=${encodeURIComponent(attemptId)}` : ""
  }`;
}

export function buildDesktopOAuthStartPath(callbackUrl: string, requestId?: string) {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl);
  return `${DESKTOP_OAUTH_START_PATH}?callbackUrl=${encodeURIComponent(safeCallbackUrl)}${
    requestId ? `&request=${encodeURIComponent(requestId)}` : ""
  }`;
}

export function buildDesktopOAuthStartUrl(callbackUrl: string, origin: string, requestId?: string) {
  return new URL(buildDesktopOAuthStartPath(callbackUrl, requestId), origin).toString();
}
