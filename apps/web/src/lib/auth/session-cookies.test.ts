import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expireAuthSessionCookies,
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
