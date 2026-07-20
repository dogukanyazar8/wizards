export type MobileGoogleNativeSignInOutcome =
  | { readonly idToken: string; readonly type: "signed-in" }
  | { readonly type: "cancelled" }
  | { readonly reason: "no-id-token" | "unavailable"; readonly type: "failed" };

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
  readonly webClientId: string | null;
}

/**
 * Drives Google's own account sheet on the device (Credential Manager on
 * Android). Nothing but the resulting ID token leaves this function — the token
 * is verified server side before any Whispr session exists, and no browser,
 * OAuth code or client secret is involved.
 *
 * Returns `failed/unavailable` instead of throwing whenever the native path
 * cannot run (no Play Services, module missing from an older build, no client
 * id configured) so the caller can fall back to the web hand-off.
 */
export async function runMobileGoogleNativeSignIn({
  client,
  webClientId,
}: RunMobileGoogleNativeSignInOptions): Promise<MobileGoogleNativeSignInOutcome> {
  if (!client || !webClientId) {
    return { reason: "unavailable", type: "failed" };
  }

  try {
    client.configure({ webClientId });

    if (!(await client.hasPlayServices())) {
      return { reason: "unavailable", type: "failed" };
    }
  } catch {
    return { reason: "unavailable", type: "failed" };
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
    return isMobileGoogleCancellation(error)
      ? { type: "cancelled" }
      : { reason: "unavailable", type: "failed" };
  }

  if (result.type === "cancelled") {
    return { type: "cancelled" };
  }

  const idToken = result.data?.idToken;

  if (result.type !== "success" || typeof idToken !== "string" || !idToken) {
    return { reason: "no-id-token", type: "failed" };
  }

  return { idToken, type: "signed-in" };
}

/**
 * Older native module versions reject instead of resolving `cancelled`, and the
 * codes differ between the Credential Manager and legacy implementations.
 */
export function isMobileGoogleCancellation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;

  return (
    code === "SIGN_IN_CANCELLED" ||
    code === "12501" ||
    code === 12501 ||
    code === "CANCELED" ||
    code === "ERR_CANCELED"
  );
}
