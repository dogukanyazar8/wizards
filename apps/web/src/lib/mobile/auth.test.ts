import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createMobileAuthHandoffToken,
  exchangeMobileAuthHandoffToken,
  isMobileAccessSessionActive,
  isMobileAuthHandoffToken,
  refreshMobileSession,
  revokeMobileSession,
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

  async eval(script: string, _keyCount: number, key: string, ...args: string[]) {
    if (script.includes("redis.call('SET'")) {
      this.values.set(key, args[0] ?? "");
      return "OK";
    }

    const value = this.values.get(key) ?? null;
    if (script.includes("redis.call('DEL'")) {
      this.values.delete(key);
    }

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
    const accessClaims = verifyMobileAccessToken(response?.session.tokens.accessToken ?? "", {
      env,
      nowMs: 1_800_000_000_000,
    });
    assert.ok(accessClaims?.sessionId);
    assert.deepEqual(accessClaims, {
      scopes: ["mobile:bootstrap"],
      sessionId: accessClaims.sessionId,
      userId: "user-1",
    });
    assert.equal(typeof response?.session.tokens.refreshToken, "string");

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

  it("rotates refresh tokens and rejects replayed refresh credentials", async () => {
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
    const refreshToken = response?.session.tokens.refreshToken;
    assert.equal(typeof refreshToken, "string");

    const refreshed = await refreshMobileSession(refreshToken ?? "", {
      env,
      loadUser,
      nowMs: 1_800_000_060_000,
      redis,
    });
    assert.equal(refreshed?.session.user.id, "user-1");
    assert.notEqual(refreshed?.session.tokens.refreshToken, refreshToken);
    assert.equal(refreshed?.session.tokens.expiresAt, 1_800_000_960_000);

    assert.equal(
      await refreshMobileSession(refreshToken ?? "", { env, loadUser, redis }),
      null,
    );
  });

  it("revokes mobile sessions server-side", async () => {
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
    const accessClaims = verifyMobileAccessToken(response?.session.tokens.accessToken ?? "", {
      env,
      nowMs: 1_800_000_000_000,
    });
    assert.ok(accessClaims);
    assert.equal(await isMobileAccessSessionActive(accessClaims, { redis }), true);

    await revokeMobileSession(
      { refreshToken: response?.session.tokens.refreshToken ?? null },
      { redis },
    );

    assert.equal(await isMobileAccessSessionActive(accessClaims, { redis }), false);
    assert.equal(
      await refreshMobileSession(response?.session.tokens.refreshToken ?? "", {
        env,
        loadUser,
        redis,
      }),
      null,
    );
  });
});
