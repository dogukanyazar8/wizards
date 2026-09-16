import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextRequest } from "next/server";
import { decode, encode } from "next-auth/jwt";
import { authSessionJwt, refreshJwtSessionExpiry } from "./session-lifetime";
import { authLogger } from "./auth-logger";

// Exercise the pinned Auth.js boundary: its default 30-day cookie must not
// outlive a shorter JWT returned by the application's jwt callback.
describe("Auth.js session expiry contract", () => {
  it("cleans expired HTTP sessions silently while retaining unexpected failures", async (t) => {
    const output = t.mock.method(console, "error", () => {});
    const secret = randomBytes(32).toString("hex");
    for (const secure of [false, true]) {
      const name = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
      const { handlers } = NextAuth({
        secret,
        trustHost: true,
        basePath: "/api/auth",
        debug: false,
        logger: authLogger,
        jwt: authSessionJwt,
        session: { strategy: "jwt" },
        providers: [Credentials({ authorize: async () => null })],
        cookies: {
          sessionToken: { name, options: { httpOnly: true, path: "/", sameSite: "lax", secure } },
        },
      });
      const expired = await encode({
        secret,
        salt: name,
        maxAge: -60,
        token: {
          sub: "synthetic-user",
          email: "private@example.invalid",
          authSessionId: "private-session",
        },
      });
      const before = output.mock.callCount();
      const response = await handlers.GET(
        new NextRequest("https://example.invalid/api/auth/session", {
          headers: { cookie: `${name}=${expired}` },
        }),
      );
      assert.equal(response.status, 200);
      assert.equal(await response.json(), null);
      assert.ok(
        response.headers
          .getSetCookie()
          .some((cookie) => cookie.startsWith(`${name}=`) && cookie.includes("Max-Age=0")),
      );
      assert.equal(output.mock.callCount(), before);
      const invalid = await handlers.GET(
        new NextRequest("https://example.invalid/api/auth/session", {
          headers: { cookie: `${name}=private-invalid-token` },
        }),
      );
      assert.equal(await invalid.json(), null);
      assert.equal(output.mock.callCount(), before + 1);
    }
    const log = JSON.stringify(output.mock.calls.map((call) => call.arguments));
    assert.match(log, /JWTSessionError/);
    assert.doesNotMatch(log, /private@example|private-session|private-invalid-token/);
  });

  for (const rememberMe of [false, true]) {
    it(`aligns credential login and renewal cookies with rememberMe=${rememberMe}`, async () => {
      const secret = randomBytes(32).toString("hex");
      const cookieName = "authjs.session-token";
      const maxAge = rememberMe ? 2_592_000 : 43_200;
      const config: NextAuthConfig = {
        secret,
        trustHost: true,
        basePath: "/api/auth",
        logger: authLogger,
        providers: [Credentials({ authorize: async () => ({ id: "synthetic-user" }) })],
        session: { strategy: "jwt", maxAge: 2_592_000 },
        cookies: {
          sessionToken: {
            name: cookieName,
            options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
          },
        },
        jwt: authSessionJwt,
        callbacks: {
          jwt({ token }) {
            token.rememberMe = rememberMe;
            refreshJwtSessionExpiry(token);
            return token;
          },
        },
      };
      const { handlers } = NextAuth(config);
      const csrf = await handlers.GET(new NextRequest("http://localhost/api/auth/csrf"));
      const { csrfToken } = (await csrf.json()) as { csrfToken: string };
      const csrfCookies = csrf.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
      const login = await handlers.POST(
        new NextRequest("http://localhost/api/auth/callback/credentials", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie: csrfCookies.join("; "),
          },
          body: new URLSearchParams({ csrfToken, callbackUrl: "http://localhost/home" }),
        }),
      );
      const loginCookie = login.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith(`${cookieName}=`));
      assert.ok(loginCookie, "successful credentials login must issue a session cookie");
      await assertCookieLifetime(loginCookie);

      const renewal = await handlers.GET(
        new NextRequest("http://localhost/api/auth/session", {
          headers: { cookie: loginCookie.split(";")[0]! },
        }),
      );
      const session = (await renewal.json()) as { expires: string };
      const renewedCookie = renewal.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith(`${cookieName}=`));
      assert.ok(renewedCookie);
      const renewedJwt = await assertCookieLifetime(renewedCookie);
      assert.equal(Date.parse(session.expires), renewedJwt.exp! * 1_000);

      async function assertCookieLifetime(cookie: string) {
        const value = cookie.split(";")[0]!.slice(cookieName.length + 1);
        const jwt = await decode({ secret, salt: cookieName, token: value });
        assert.ok(jwt);
        const expires = /Expires=([^;]+)/i.exec(cookie)?.[1];
        assert.ok(expires);
        assert.equal(jwt.exp! - jwt.iat!, maxAge);
        assert.equal(Date.parse(expires), jwt.exp! * 1_000);
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /SameSite=Lax/i);
        return jwt;
      }
    });
  }
});
