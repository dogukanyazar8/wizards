import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consumeDesktopOAuthHandoffToken,
  createDesktopOAuthHandoffToken,
  isDesktopOAuthHandoffToken,
} from "./desktop-oauth-handoff";

class MemoryRedis {
  private readonly values = new Map<string, string>();

  async set(key: string, value: string, _mode: "EX", _ttlSeconds: number, condition: "NX") {
    if (condition === "NX" && this.values.has(key)) {
      return null;
    }

    this.values.set(key, value);
    return "OK" as const;
  }

  async eval(_script: string, _keyCount: number, key: string) {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
}

interface TestDesktopOAuthUser {
  avatarUrl: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  email: string;
  emailVerified: Date | null;
  id: string;
  isBanned: boolean;
  locale: string | null;
  theme: string | null;
  username: string;
}

function buildVerifiedUser(overrides: Partial<TestDesktopOAuthUser> = {}): TestDesktopOAuthUser {
  return {
    avatarUrl: null,
    deletedAt: null,
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    emailVerified: new Date("2026-01-01T00:00:00.000Z"),
    id: "user-1",
    isBanned: false,
    locale: "en",
    theme: "light",
    username: "ada",
    ...overrides,
  };
}

async function loadUser() {
  return buildVerifiedUser();
}

describe("desktop OAuth handoff", () => {
  it("creates a safe single-use handoff token", async () => {
    const redis = new MemoryRedis();
    const handoff = await createDesktopOAuthHandoffToken(
      { callbackUrl: "/messages", userId: "user-1" },
      { nowMs: 1_800_000_000_000, redis },
    );

    assert.equal(isDesktopOAuthHandoffToken(handoff.token), true);
    assert.equal(handoff.callbackUrl, "/messages");

    const user = await consumeDesktopOAuthHandoffToken(
      handoff.token,
      { expectedCallbackUrl: "/messages" },
      { loadUser, redis },
    );
    assert.equal(user?.id, "user-1");

    const replay = await consumeDesktopOAuthHandoffToken(
      handoff.token,
      { expectedCallbackUrl: "/messages" },
      { loadUser, redis },
    );
    assert.equal(replay, null);
  });

  it("burns the token when the expected callback does not match", async () => {
    const redis = new MemoryRedis();
    const handoff = await createDesktopOAuthHandoffToken(
      { callbackUrl: "/messages", userId: "user-1" },
      { redis },
    );

    assert.equal(
      await consumeDesktopOAuthHandoffToken(
        handoff.token,
        { expectedCallbackUrl: "/settings" },
        { loadUser, redis },
      ),
      null,
    );
    assert.equal(
      await consumeDesktopOAuthHandoffToken(
        handoff.token,
        { expectedCallbackUrl: "/messages" },
        { loadUser, redis },
      ),
      null,
    );
  });

  it("fails closed for invalid tokens and inactive users", async () => {
    const redis = new MemoryRedis();

    assert.equal(
      await consumeDesktopOAuthHandoffToken(
        "not-a-valid-token",
        { expectedCallbackUrl: "/messages" },
        {
          loadUser: async () => {
            throw new Error("invalid tokens must not load a user");
          },
          redis,
        },
      ),
      null,
    );

    for (const inactiveUser of [
      buildVerifiedUser({ deletedAt: new Date("2026-01-01T00:00:00.000Z") }),
      buildVerifiedUser({ emailVerified: null }),
      buildVerifiedUser({ isBanned: true }),
    ]) {
      const handoff = await createDesktopOAuthHandoffToken(
        { callbackUrl: "/messages", userId: inactiveUser.id },
        { redis },
      );

      assert.equal(
        await consumeDesktopOAuthHandoffToken(
          handoff.token,
          { expectedCallbackUrl: "/messages" },
          {
            loadUser: async () => inactiveUser,
            redis,
          },
        ),
        null,
      );
    }
  });
});
