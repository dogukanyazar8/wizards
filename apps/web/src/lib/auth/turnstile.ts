const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EXPECTED_TURNSTILE_ACTION = "register";
const TURNSTILE_VERIFY_TIMEOUT_MS = 8000;

type TurnstileSiteVerifyResponse = {
  action?: string;
  "error-codes"?: string[];
  hostname?: string;
  success: boolean;
};

export type TurnstileErrorCode =
  | "ACTION_MISMATCH"
  | "CONFIGURATION_ERROR"
  | "INVALID_TOKEN"
  | "VERIFY_FAILED";

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
    throw new TurnstileVerificationError(
      "ACTION_MISMATCH",
      "Turnstile hostname mismatch.",
    );
  }
}

export async function verifyTurnstileToken(token: string, remoteIp?: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new TurnstileVerificationError(
      "INVALID_TOKEN",
      "Turnstile token is required.",
    );
  }

  const body = new URLSearchParams({
    response: normalizedToken,
    secret: getTurnstileSecret(),
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

    throw new TurnstileVerificationError(
      "VERIFY_FAILED",
      "Turnstile verification failed.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!result.success) {
    throw new TurnstileVerificationError(
      "INVALID_TOKEN",
      "Turnstile verification failed.",
    );
  }

  if (result.action && result.action !== EXPECTED_TURNSTILE_ACTION) {
    throw new TurnstileVerificationError(
      "ACTION_MISMATCH",
      "Turnstile action mismatch.",
    );
  }

  assertTurnstileHostnameAllowed(
    result.hostname,
    getExpectedTurnstileHostnames(),
    process.env.NODE_ENV === "production",
  );

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
