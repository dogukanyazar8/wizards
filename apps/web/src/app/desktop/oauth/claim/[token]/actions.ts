"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";
import { isDesktopOAuthHandoffToken } from "@/lib/auth/desktop-oauth-handoff";

export interface ClaimDesktopOAuthHandoffResult {
  error?: string;
  success: boolean;
}

export async function claimDesktopOAuthHandoffAction(
  token: string,
  callbackUrl: string,
): Promise<ClaimDesktopOAuthHandoffResult> {
  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl);
  // A repeated deep link must never replace an established desktop session.
  const session = await auth();
  if (session?.user?.id) {
    redirect(safeCallbackUrl);
  }

  if (!isDesktopOAuthHandoffToken(token)) {
    return {
      error: "auth.desktopOAuth.invalid",
      success: false,
    };
  }

  try {
    await signIn("credentials", {
      desktopOAuthCallbackUrl: safeCallbackUrl,
      desktopOAuthHandoffToken: token,
      redirectTo: safeCallbackUrl,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "auth.desktopOAuth.failed",
        success: false,
      };
    }

    throw error;
  }
}
