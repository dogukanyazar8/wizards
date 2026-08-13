import type { MobileDeepLinkParseResult } from "../deep-link/mobile-deep-links";

/**
 * Redirect target the in-app auth session waits for. It matches the
 * `whispr://oauth/<token>` deep link the web hand-off page emits, so the system
 * browser tab closes itself the moment the token comes back.
 */
export const MOBILE_SOCIAL_AUTH_REDIRECT_URL = "whispr://oauth";

export type MobileSocialAuthSessionResultType = "cancel" | "dismiss" | "locked" | "opened";

export interface MobileSocialAuthSessionRawResult {
  readonly type: string;
  readonly url?: string | null;
}

export type MobileSocialAuthSessionOutcome =
  | {
      readonly callbackPath: string;
      readonly handoffToken: string;
      readonly state: string;
      readonly type: "completed";
    }
  | { readonly type: "cancelled" }
  | { readonly reason: "invalid-callback" | "unavailable"; readonly type: "failed" };

export interface RunMobileSocialAuthSessionOptions {
  readonly openAuthSession: (
    startUrl: string,
    redirectUrl: string,
  ) => Promise<MobileSocialAuthSessionRawResult>;
  readonly parseDeepLink: (url: string) => MobileDeepLinkParseResult;
  readonly redirectUrl?: string;
  readonly startUrl: string;
}

/**
 * Drives the provider consent screen inside the app (Android Custom Tabs / iOS
 * ASWebAuthenticationSession) instead of handing the user to the standalone
 * browser app. Only the one-time handoff token ever crosses back into the app;
 * the OAuth code and the provider tokens stay inside the browser session.
 */
export async function runMobileSocialAuthSession({
  openAuthSession,
  parseDeepLink,
  redirectUrl = MOBILE_SOCIAL_AUTH_REDIRECT_URL,
  startUrl,
}: RunMobileSocialAuthSessionOptions): Promise<MobileSocialAuthSessionOutcome> {
  let result: MobileSocialAuthSessionRawResult;

  try {
    result = await openAuthSession(startUrl, redirectUrl);
  } catch {
    // No in-app browser available (bare runtime, Custom Tabs disabled, older
    // build without the native module). The caller falls back to the external
    // browser hand-off, which still lands through the deep link listener.
    return { reason: "unavailable", type: "failed" };
  }

  if (result.type === "cancel" || result.type === "dismiss") {
    return { type: "cancelled" };
  }

  if (result.type !== "success" || !result.url) {
    return { reason: "unavailable", type: "failed" };
  }

  const parsed = parseDeepLink(result.url);

  if (!parsed.ok || parsed.intent.type !== "auth-handoff") {
    return { reason: "invalid-callback", type: "failed" };
  }

  return {
    callbackPath: parsed.intent.callbackPath,
    handoffToken: parsed.intent.token,
    state: parsed.intent.state,
    type: "completed",
  };
}
