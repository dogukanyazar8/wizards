import type { JWT } from "next-auth/jwt";

const AUTH_SESSION_COOKIE_CHUNK_COUNT = 8;

type AuthSessionCookieWriter = {
  set: (
    name: string,
    value: string,
    options: {
      expires: Date;
      httpOnly: boolean;
      maxAge: number;
      path: string;
      sameSite: "strict";
      secure: boolean;
    },
  ) => void;
};

export function getAuthSessionCookieConfig() {
  const secureCookie = process.env.NODE_ENV === "production";

  return {
    cookieName: secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token",
    secureCookie,
  };
}

export function getAuthSessionCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
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
