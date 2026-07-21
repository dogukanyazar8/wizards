/**
 * Why the native sheet could not complete. Every reason still falls back to the
 * browser hand-off, but they are kept apart because they need different fixes:
 * `not-configured` is a build/env problem, `developer-error` is a Google Cloud
 * client mismatch, and `play-services-unavailable` is the device itself.
 */
export type MobileGoogleNativeSignInFailureReason =
  | "developer-error"
  | "module-missing"
  | "no-id-token"
  | "not-configured"
  | "play-services-unavailable"
  | "sign-in-error";

export type MobileGoogleNativeSignInOutcome =
  | { readonly idToken: string; readonly type: "signed-in" }
  | { readonly type: "cancelled" }
  | {
      readonly detail?: string;
      readonly reason: MobileGoogleNativeSignInFailureReason;
      readonly type: "failed";
    };

export interface MobileGoogleNativeSignInClient {
  /** Rejects (or resolves false) when Play Services are missing or outdated. */
  readonly hasPlayServices: () => Promise<boolean>;
  readonly configure: (options: { webClientId: string }) => void;
  /** Clears the cached account so the sheet always lets the user pick again. */
  readonly signOut: () => Promise<unknown>;
  readonly signIn: () => Promise<{
    data?: { idToken?: string | null } | null;
    type: string;
  }>;
}

export interface RunMobileGoogleNativeSignInOptions {
  readonly client: MobileGoogleNativeSignInClient | null;
  /** Receives every non-cancellation failure so builds can surface the cause. */
  readonly onFailure?: (failure: {
    detail?: string;
    reason: MobileGoogleNativeSignInFailureReason;
  }) => void;
  readonly webClientId: string | null;
}

/**
 * Drives Google's own account sheet on the device (Credential Manager on
 * Android). Nothing but the resulting ID token leaves this function — the token
 * is verified server side before any Whispr session exists, and no browser,
 * OAuth code or client secret is involved.
 *
 * Never throws: the caller falls back to the web hand-off on any failure, so a
 * device without Play Services still has a way to sign in.
 */
export async function runMobileGoogleNativeSignIn({
  client,
  onFailure,
  webClientId,
}: RunMobileGoogleNativeSignInOptions): Promise<MobileGoogleNativeSignInOutcome> {
  const fail = (
    reason: MobileGoogleNativeSignInFailureReason,
    detail?: string,
  ): MobileGoogleNativeSignInOutcome => {
    onFailure?.(detail === undefined ? { reason } : { detail, reason });
    return detail === undefined
      ? ({ reason, type: "failed" } as const)
      : ({ detail, reason, type: "failed" } as const);
  };

  if (!client) {
    return fail("module-missing", "The native Google module is not present in this build.");
  }

  if (!webClientId) {
    // The bundle was built without EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID.
    return fail(
      "not-configured",
      "EXPO_PUBLIC_WHISPR_GOOGLE_WEB_CLIENT_ID was not inlined into this build.",
    );
  }

  try {
    client.configure({ webClientId });
  } catch (error) {
    return fail("module-missing", describeMobileGoogleError(error));
  }

  try {
    if (!(await client.hasPlayServices())) {
      return fail("play-services-unavailable", "Google Play services are missing or outdated.");
    }
  } catch (error) {
    return fail("play-services-unavailable", describeMobileGoogleError(error));
  }

  // A previously remembered account would sign the user straight back in
  // without showing the picker, which is wrong on a shared or re-used device.
  try {
    await client.signOut();
  } catch {
    // Nothing was cached; the sheet is about to ask anyway.
  }

  let result: Awaited<ReturnType<MobileGoogleNativeSignInClient["signIn"]>>;

  try {
    result = await client.signIn();
  } catch (error) {
    if (isMobileGoogleCancellation(error)) {
      return { type: "cancelled" };
    }

    return isMobileGoogleDeveloperError(error)
      ? fail(
          "developer-error",
          `${describeMobileGoogleError(error)} — the installed APK's package name and signing SHA-1 do not match an Android OAuth client in Google Cloud.`,
        )
      : fail("sign-in-error", describeMobileGoogleError(error));
  }

  if (result.type === "cancelled") {
    return { type: "cancelled" };
  }

  const idToken = result.data?.idToken;

  if (result.type !== "success" || typeof idToken !== "string" || !idToken) {
    return fail("no-id-token", `The sheet returned "${result.type}" without an ID token.`);
  }

  return { idToken, type: "signed-in" };
}

/**
 * Older native module versions reject instead of resolving `cancelled`, and the
 * codes differ between the Credential Manager and legacy implementations.
 */
export function isMobileGoogleCancellation(error: unknown): boolean {
  const code = readMobileGoogleErrorCode(error);

  return (
    code === "SIGN_IN_CANCELLED" ||
    code === "12501" ||
    code === "CANCELED" ||
    code === "ERR_CANCELED"
  );
}

/**
 * Google's `DEVELOPER_ERROR` (status code 10) is the signature/package mismatch
 * signal — the single most common reason a build that works on one machine
 * fails on another device.
 */
export function isMobileGoogleDeveloperError(error: unknown): boolean {
  const code = readMobileGoogleErrorCode(error);

  return code === "DEVELOPER_ERROR" || code === "10";
}

function readMobileGoogleErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const code = (error as { code?: unknown }).code;

  if (typeof code === "string") {
    return code;
  }

  return typeof code === "number" ? String(code) : null;
}

function describeMobileGoogleError(error: unknown): string {
  const code = readMobileGoogleErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  return code ? `[${code}] ${message}` : message;
}
