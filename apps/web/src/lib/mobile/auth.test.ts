import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMobileAuthHandoffToken,
  exchangeMobileAuthHandoffToken,
  isMobileAuthHandoffToken,
  verifyMobileAccessToken,
} from "./auth";

class MemoryRedis {
  readonly values = new Map<string, string>();

  async set(
    key: string,
    value: string,
    _mode: "EX",
    _ttlSeconds: number,
    condition: "NX",
  ) {
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

interface TestMobileAuthUser {
  avatarUrl: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  username: string;
}

const env: NodeJS.ProcessEnv = {
  AUTH_SECRET: "test-mobile-auth-secret",
  NODE_ENV: "test",
};

function buildVerifiedUser(overrides: Partial<TestMobileAuthUser> = {}): TestMobileAuthUser {
  return {
    avatarUrl: "https://whispr.team/avatar.png",
    deletedAt: null,
    displayName: "Ada Lovelace",
    emailVerified: true,
    id: "user-1",
    isBanned: false,
    username: "ada",
    ...overrides,
  };
}

async function loadUser() {
  return buildVerifiedUser();
}

describe("mobile auth handoff", () => {
  it("exchanges a safe single-use handoff for a signed mobile session", async () => {
    const redis = new MemoryRedis();
    const handoff = await createMobileAuthHandoffToken(
      { callbackPath: "/channels/@me", userId: "user-1" },
      { nowMs: 1_800_000_000_000, redis },
    );

    assert.equal(isMobileAuthHandoffToken(handoff.token), true);
    assert.equal(handoff.callbackPath, "/channels/@me");
    assert.equal([...redis.values.keys()].some((key) => key.includes(handoff.token)), false);

    const response = await exchangeMobileAuthHandoffToken(
      handoff.token,
      { expectedCallbackPath: "/channels/@me" },
      { env, loadUser, nowMs: 1_800_000_000_000, redis },
    );

    assert.equal(response?.session.user.id, "user-1");
    assert.equal(response?.session.tokens.tokenType, "Bearer");
    assert.deepEqual(
      verifyMobileAccessToken(response?.session.tokens.accessToken ?? "", {
        env,
        nowMs: 1_800_000_000_000,
      }),
      {
        scopes: ["mobile:bootstrap"],
        userId: "user-1",
      },
    );

    const replay = await exchangeMobileAuthHandoffToken(
      handoff.token,
      { expectedCallbackPath: "/channels/@me" },
      { env, loadUser, redis },
    );
    assert.equal(replay, null);
  });

  it("burns handoff tokens when callback paths do not match", async () => {
    const redis = new MemoryRedis();
    const handoff = await createMobileAuthHandoffToken(
      { callbackPath: "/channels", userId: "user-1" },
      { redis },
    );

    assert.equal(
      await exchangeMobileAuthHandoffToken(
        handoff.token,
        { expectedCallbackPath: "/settings" },
        { env, loadUser, redis },
      ),
      null,
    );
    assert.equal(
      await exchangeMobileAuthHandoffToken(
        handoff.token,
        { expectedCallbackPath: "/channels" },
        { env, loadUser, redis },
      ),
      null,
    );
  });

  it("fails closed for inactive users and invalid bearer tokens", async () => {
    const redis = new MemoryRedis();

    assert.equal(
      await exchangeMobileAuthHandoffToken(
        "not-a-valid-token",
        { expectedCallbackPath: "/channels" },
        {
          env,
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
      buildVerifiedUser({ emailVerified: false }),
      buildVerifiedUser({ isBanned: true }),
    ]) {
      const handoff = await createMobileAuthHandoffToken(
        { callbackPath: "/channels", userId: inactiveUser.id },
        { redis },
      );

      assert.equal(
        await exchangeMobileAuthHandoffToken(
          handoff.token,
          { expectedCallbackPath: "/channels" },
          {
            env,
            loadUser: async () => inactiveUser,
            redis,
          },
        ),
        null,
      );
    }

    assert.equal(verifyMobileAccessToken("bad.token.value", { env }), null);
  });

  it("rejects expired or differently signed mobile bearer tokens", async () => {
    const redis = new MemoryRedis();
    const handoff = await createMobileAuthHandoffToken(
      { callbackPath: "/channels", userId: "user-1" },
      { redis },
    );
    const response = await exchangeMobileAuthHandoffToken(
      handoff.token,
      { expectedCallbackPath: "/channels" },
      { env, loadUser, nowMs: 1_800_000_000_000, redis },
    );
    const accessToken = response?.session.tokens.accessToken ?? "";

    assert.equal(
      verifyMobileAccessToken(accessToken, {
        env,
        nowMs: 1_800_000_000_000 + 13 * 60 * 60_000,
      }),
      null,
    );
    assert.equal(
      verifyMobileAccessToken(accessToken, {
        env: { AUTH_SECRET: "different-secret", NODE_ENV: "test" },
        nowMs: 1_800_000_000_000,
      }),
      null,
    );
  });
});
