import type { JWT } from "next-auth/jwt";
import { isLocalE2EHost } from "@/lib/e2e/route-guard";

const AUTH_SESSION_COOKIE_CHUNK_COUNT = 8;
const AUTH_COOKIE_URL_KEYS = ["APP_URL", "AUTH_URL", "NEXTAUTH_URL"] as const;

type AuthSessionCookieEnv = Record<string, string | undefined>;

type AuthSessionCookieWriter = {
  set: (
    name: string,
    value: string,
    options: {
      expires: Date;
      httpOnly: boolean;
      maxAge: number;
      path: string;
      sameSite: "lax";
      secure: boolean;
    },
  ) => void;
};

function isExplicitLocalProductionE2E(env: AuthSessionCookieEnv): boolean {
  if (env.E2E_TEST_MODE !== "true" || env.E2E_ALLOW_PRODUCTION_BUILD !== "true") {
    return false;
  }

  return AUTH_COOKIE_URL_KEYS.every((key) => {
    const value = env[key]?.trim();
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);
      return url.protocol === "http:" && isLocalE2EHost(url.hostname);
    } catch {
      return false;
    }
  });
}

export function getAuthSessionCookieConfig(env: AuthSessionCookieEnv = process.env) {
  const secureCookie = env.NODE_ENV === "production" && !isExplicitLocalProductionE2E(env);

  return {
    cookieName: secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token",
    secureCookie,
  };
}

export function getAuthSessionCookieOptions(env: AuthSessionCookieEnv = process.env) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: getAuthSessionCookieConfig(env).secureCookie,
  };
}

export function getAuthSessionCookieNamesToClear(
  cookieName = getAuthSessionCookieConfig().cookieName,
) {
  return [
    cookieName,
    ...Array.from(
      { length: AUTH_SESSION_COOKIE_CHUNK_COUNT },
      (_, index) => `${cookieName}.${index}`,
    ),
  ];
}

export function shouldClearDesktopSessionOnClose(
  token: Pick<JWT, "rememberMe"> | null | undefined,
) {
  return token?.rememberMe === false;
}

export function expireAuthSessionCookies(cookies: AuthSessionCookieWriter) {
  for (const cookieName of getAuthSessionCookieNamesToClear()) {
    cookies.set(cookieName, "", {
      ...getAuthSessionCookieOptions(),
      expires: new Date(0),
      maxAge: 0,
    });
  }
}
