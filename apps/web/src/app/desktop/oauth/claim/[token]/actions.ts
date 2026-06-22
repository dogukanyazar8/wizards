"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
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
  if (!isDesktopOAuthHandoffToken(token)) {
    return {
      error: "auth.desktopOAuth.invalid",
      success: false,
    };
  }

  const safeCallbackUrl = getSafeAuthRedirectPath(callbackUrl);

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
