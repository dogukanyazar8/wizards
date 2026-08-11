import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expireAuthSessionCookies,
  getAuthSessionCookieConfig,
  getAuthSessionCookieOptions,
  getAuthSessionCookieNamesToClear,
  shouldClearDesktopSessionOnClose,
} from "./session-cookies";

describe("auth session cookies", () => {
  it("uses OAuth-compatible Lax session cookies while keeping HttpOnly protection", () => {
    assert.deepEqual(getAuthSessionCookieOptions(), {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });

  it("uses non-secure cookies only for explicitly gated HTTP-loopback production E2E", () => {
    const localE2EEnv = {
      APP_URL: "http://127.0.0.1:3000",
      AUTH_URL: "http://localhost:3000",
      E2E_ALLOW_PRODUCTION_BUILD: "true",
      E2E_TEST_MODE: "true",
      NEXTAUTH_URL: "http://[::1]:3000",
      NODE_ENV: "production",
    };

    assert.deepEqual(getAuthSessionCookieConfig(localE2EEnv), {
      cookieName: "authjs.session-token",
      secureCookie: false,
    });
    assert.equal(getAuthSessionCookieOptions(localE2EEnv).secure, false);

    for (const unsafeEnv of [
      { ...localE2EEnv, E2E_ALLOW_PRODUCTION_BUILD: undefined },
      { ...localE2EEnv, APP_URL: "https://uat.whispr.team" },
      { ...localE2EEnv, AUTH_URL: undefined },
      { ...localE2EEnv, NEXTAUTH_URL: "not-a-url" },
    ]) {
      assert.equal(getAuthSessionCookieConfig(unsafeEnv).secureCookie, true);
      assert.equal(getAuthSessionCookieOptions(unsafeEnv).secure, true);
    }
  });

  it("clears desktop sessions only when remember-me was explicitly disabled", () => {
    assert.equal(shouldClearDesktopSessionOnClose({ rememberMe: false }), true);
    assert.equal(shouldClearDesktopSessionOnClose({ rememberMe: true }), false);
    assert.equal(shouldClearDesktopSessionOnClose({}), false);
    assert.equal(shouldClearDesktopSessionOnClose(null), false);
  });

  it("expires the base Auth.js cookie and bounded chunk cookies", () => {
    const writes: Array<{
      maxAge: number;
      name: string;
      value: string;
    }> = [];

    expireAuthSessionCookies({
      set(name, value, options) {
        writes.push({
          maxAge: options.maxAge,
          name,
          value,
        });
      },
    });

    assert.deepEqual(
      writes.map((write) => write.name),
      getAuthSessionCookieNamesToClear(),
    );
    assert.ok(writes.length > 1);
    assert.ok(writes.every((write) => write.maxAge === 0));
    assert.ok(writes.every((write) => write.value === ""));
  });
});
