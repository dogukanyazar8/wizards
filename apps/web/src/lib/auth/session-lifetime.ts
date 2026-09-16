import type { NextAuthConfig } from "next-auth";
import { decode, encode, type JWT } from "next-auth/jwt";

export const REMEMBERED_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SHORT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export function getJwtSessionMaxAge(token: unknown) {
  return token && typeof token === "object" && "rememberMe" in token && token.rememberMe === false
    ? SHORT_SESSION_MAX_AGE_SECONDS
    : REMEMBERED_SESSION_MAX_AGE_SECONDS;
}

export function refreshJwtSessionExpiry(token: JWT, nowSeconds = Math.floor(Date.now() / 1000)) {
  token.exp = nowSeconds + getJwtSessionMaxAge(token);
  return token.exp;
}

export const authSessionJwt = {
  maxAge: REMEMBERED_SESSION_MAX_AGE_SECONDS,
  async encode(params) {
    // The pinned core patch also caps encryption at the callback's exp, so
    // asynchronous key derivation cannot extend it across a clock boundary.
    return encode({ ...params, maxAge: getJwtSessionMaxAge(params.token) });
  },
  decode,
} satisfies NonNullable<NextAuthConfig["jwt"]>;
