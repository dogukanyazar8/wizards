import { E2E_TURNSTILE_TOKEN } from "./turnstile-e2e";
import { assertE2EApiRouteEnabled } from "@/lib/e2e/route-guard";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA";
const DEFAULT_TURNSTILE_ACTION = "register";
const TURNSTILE_VERIFY_TIMEOUT_MS = 8000;

export type TurnstileAction = "forgot-password" | "login" | "register" | "reset-password";

type TurnstileSiteVerifyResponse = {
  action?: string;
  "error-codes"?: string[];
  hostname?: string;
  success: boolean;
};

export type TurnstileErrorCode =
  "ACTION_MISMATCH" | "CONFIGURATION_ERROR" | "INVALID_TOKEN" | "VERIFY_FAILED";

export class TurnstileVerificationError extends Error {
  constructor(
    public readonly code: TurnstileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TurnstileVerificationError";
  }
}

function getTurnstileSecret() {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    throw new TurnstileVerificationError(
      "CONFIGURATION_ERROR",
      "Turnstile secret key is not configured.",
    );
  }

  if (secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET && process.env.NODE_ENV === "production") {
    throw new TurnstileVerificationError(
      "CONFIGURATION_ERROR",
      "Cloudflare's public Turnstile test secret cannot be used in production.",
    );
  }

  return secret;
}

export function getExpectedTurnstileHostnames(
  env: Record<string, string | undefined> = process.env,
) {
  return [env.APP_URL, env.AUTH_URL, env.NEXTAUTH_URL]
    .map((value) => {
      if (!value?.trim()) {
        return null;
      }

      try {
        return new URL(value.trim()).hostname.toLowerCase();
      } catch {
        return null;
      }
    })
    .filter((hostname): hostname is string => Boolean(hostname));
}

export function assertTurnstileHostnameAllowed(
  hostname: string | undefined,
  expectedHostnames: string[],
  isProduction = process.env.NODE_ENV === "production",
) {
  if (expectedHostnames.length === 0) {
    if (isProduction) {
      throw new TurnstileVerificationError(
        "CONFIGURATION_ERROR",
        "Turnstile hostname validation is not configured.",
      );
    }

    return;
  }

  if (hostname && !expectedHostnames.includes(hostname.toLowerCase())) {
    throw new TurnstileVerificationError("ACTION_MISMATCH", "Turnstile hostname mismatch.");
  }
}

export function assertTurnstileActionAllowed(
  action: string | undefined,
  expectedAction: TurnstileAction = DEFAULT_TURNSTILE_ACTION,
) {
  if (action && action !== expectedAction) {
    throw new TurnstileVerificationError("ACTION_MISMATCH", "Turnstile action mismatch.");
  }
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
  options: { expectedAction?: TurnstileAction; requestUrl?: URL | string } = {},
) {
  const normalizedToken = token.trim();
  if (
    normalizedToken === E2E_TURNSTILE_TOKEN &&
    process.env.E2E_TEST_MODE === "true" &&
    (process.env.NODE_ENV !== "production" || process.env.E2E_ALLOW_PRODUCTION_BUILD === "true")
  ) {
    // Public E2E tokens are safe only when the same local-host gate used by
    // dedicated E2E routes approves both deployment configuration and request.
    assertE2EApiRouteEnabled(options.requestUrl ?? "https://invalid.invalid");
    return true;
  }

  if (!normalizedToken) {
    throw new TurnstileVerificationError("INVALID_TOKEN", "Turnstile token is required.");
  }

  const secret = getTurnstileSecret();
  const usesLocalTestSecret =
    secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET && process.env.NODE_ENV !== "production";
  const body = new URLSearchParams({
    response: normalizedToken,
    secret,
  });

  if (remoteIp && remoteIp !== "unknown") {
    body.set("remoteip", remoteIp);
  }

  let result: TurnstileSiteVerifyResponse;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TURNSTILE_VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      body,
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new TurnstileVerificationError(
        "VERIFY_FAILED",
        "Turnstile verification service is unavailable.",
      );
    }

    result = (await response.json()) as TurnstileSiteVerifyResponse;
  } catch (error) {
    if (error instanceof TurnstileVerificationError) {
      throw error;
    }

    throw new TurnstileVerificationError("VERIFY_FAILED", "Turnstile verification failed.");
  } finally {
    clearTimeout(timeout);
  }

  if (!result.success) {
    throw new TurnstileVerificationError("INVALID_TOKEN", "Turnstile verification failed.");
  }

  assertTurnstileActionAllowed(result.action, options.expectedAction);

  if (!usesLocalTestSecret) {
    assertTurnstileHostnameAllowed(
      result.hostname,
      getExpectedTurnstileHostnames(),
      process.env.NODE_ENV === "production",
    );
  }

  return true;
}

export function getTurnstileErrorMessageKey(error: unknown) {
  if (!(error instanceof TurnstileVerificationError)) {
    return "auth.turnstile.unavailable";
  }

  switch (error.code) {
    case "CONFIGURATION_ERROR":
      return "auth.turnstile.notConfigured";
    case "ACTION_MISMATCH":
    case "INVALID_TOKEN":
      return "auth.turnstile.invalid";
    case "VERIFY_FAILED":
    default:
      return "auth.turnstile.unavailable";
  }
}
