import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMemoryAttemptStore } from "../auth/attempt-tracker";
import { getMobileLoginAttemptKey } from "../auth/mobile-login-attempts";
import {
  createMobileAuthHandoffToken,
  createMobilePasswordSession,
  exchangeMobileAuthHandoffToken,
  isMobileAccessSessionActive,
  isMobileAuthHandoffToken,
  MOBILE_REFRESH_TOKEN_GRACE_MS,
  MobileNativeAuthError,
  refreshMobileSession,
  registerMobilePasswordAccount,
  requestMobileVerificationEmail,
  revokeMobileSession,
  verifyMobileAccessToken,
} from "./auth";

class MemoryRedis {
  failEval = false;
  readonly ttlSeconds = new Map<string, number>();
  readonly values = new Map<string, string>();

  private deleteValue(key: string) {
    this.values.delete(key);
    this.ttlSeconds.delete(key);
  }

  private setValue(key: string, value: string, ttlSeconds: number) {
    this.values.set(key, value);
    this.ttlSeconds.set(key, ttlSeconds);
  }

  async set(key: string, value: string, _mode: "EX", ttlSeconds: number, condition: "NX") {
    if (condition === "NX" && this.values.has(key)) {
      return null;
    }

    this.setValue(key, value, ttlSeconds);
    return "OK" as const;
  }

  async eval(script: string, keyCount: number, ...input: string[]) {
    if (this.failEval) {
      throw new Error("Redis temporarily unavailable.");
    }

    const keys = input.slice(0, keyCount);
    const args = input.slice(keyCount);

    if (script.includes("mobile-refresh-family:create-v1")) {
      const [sessionKey = "", refreshTokenKey = ""] = keys;
      if (this.values.has(sessionKey) || this.values.has(refreshTokenKey)) {
        return ["COLLISION"];
      }

      this.setValue(sessionKey, args[0] ?? "", Number(args[2]));
      this.setValue(refreshTokenKey, args[1] ?? "", Number(args[2]));
      return ["CREATED"];
    }

    if (script.includes("mobile-refresh-family:rotate-v1")) {
      const [oldTokenKey = "", sessionKey = "", successorTokenKey = "", retryKey = ""] = keys;
      const oldRaw = this.values.get(oldTokenKey);
      if (!oldRaw) {
        return ["INVALID"];
      }
      const old = JSON.parse(oldRaw) as Record<string, unknown>;
      if (old.sessionId !== args[4] || old.userId !== args[5]) {
        return ["INVALID"];
      }

      const sessionRaw = this.values.get(sessionKey);
      if (!sessionRaw) {
        return ["INVALID"];
      }
      const session = JSON.parse(sessionRaw) as Record<string, unknown>;
      if (session.userId !== args[5]) {
        return ["INVALID"];
      }

      const nowMs = Number(args[0]);
      const graceMs = Number(args[1]);
      const tokenTtlSeconds = Number(args[2]);
      const receiptTtlSeconds = Number(args[3]);
      const expectedFamilyId = args[6];
      const expectedGeneration = Number(args[7]);
      const oldTokenHash = args[8];
      const successorTokenHash = args[9];
      const legacyToken = old.familyId === undefined && old.generation === undefined;
      const legacySession =
        session.familyId === undefined &&
        session.currentGeneration === undefined &&
        session.currentTokenHash === undefined;
      const revoke = () => {
        this.deleteValue(sessionKey);
        return ["REPLAY"];
      };

      if (
        !legacyToken &&
        (old.familyId !== expectedFamilyId || old.generation !== expectedGeneration)
      ) {
        return ["INVALID"];
      }

      if (typeof old.consumedAt === "number") {
        if (
          legacyToken ||
          nowMs - old.consumedAt > graceMs ||
          session.familyId !== expectedFamilyId ||
          session.currentGeneration !== expectedGeneration + 1 ||
          session.currentTokenHash !== old.successorTokenHash
        ) {
          return revoke();
        }

        const receipt = this.values.get(retryKey);
        if (!receipt || typeof old.successorTokenHash !== "string") {
          return revoke();
        }
        return ["RETRY", receipt, old.successorTokenHash];
      }

      if (
        (legacyToken && !legacySession) ||
        (!legacyToken &&
          (session.familyId !== expectedFamilyId ||
            session.currentGeneration !== expectedGeneration ||
            session.currentTokenHash !== oldTokenHash))
      ) {
        return revoke();
      }
      if (this.values.has(successorTokenKey)) {
        return ["COLLISION"];
      }

      old.kind = "rotated";
      old.familyId = expectedFamilyId;
      old.generation = expectedGeneration;
      old.consumedAt = nowMs;
      old.successorTokenHash = successorTokenHash;
      session.familyId = expectedFamilyId;
      session.currentGeneration = expectedGeneration + 1;
      session.currentTokenHash = successorTokenHash;
      session.lastRotatedAt = nowMs;

      this.setValue(successorTokenKey, args[10] ?? "", tokenTtlSeconds);
      this.setValue(oldTokenKey, JSON.stringify(old), tokenTtlSeconds);
      this.setValue(sessionKey, JSON.stringify(session), tokenTtlSeconds);
      this.setValue(retryKey, args[11] ?? "", receiptTtlSeconds);
      return ["ROTATED"];
    }

    if (script.includes("mobile-refresh-family:revoke-v1")) {
      for (const key of keys) {
        this.deleteValue(key);
      }
      return "REVOKED";
    }

    const key = keys[0] ?? "";
    if (script.includes("redis.call('SET'")) {
      this.values.set(key, args[0] ?? "");
      const ttlSeconds = Number(args[1]);
      if (Number.isFinite(ttlSeconds)) {
        this.ttlSeconds.set(key, ttlSeconds);
      }
      return "OK";
    }

    const value = this.values.get(key) ?? null;
    if (script.includes("redis.call('DEL'")) {
      this.deleteValue(key);
    }

    return value;
  }
}

interface TestMobileAuthUser {
  avatarUrl: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  email?: string;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  locale?: string | null;
  passwordHash?: string | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
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
    twoFactorEnabled: false,
    twoFactorSecret: null,
    username: "ada",
    ...overrides,
  };
}

function buildPasswordUser(
  overrides: Partial<Omit<TestMobileAuthUser, "email" | "locale" | "passwordHash">> & {
    email?: string;
    locale?: "en" | "tr";
    passwordHash?: string;
  } = {},
): TestMobileAuthUser & { email: string; locale: "en" | "tr"; passwordHash: string } {
  return {
    ...buildVerifiedUser(),
    email: "ada@example.com",
    locale: "tr",
    passwordHash: "stored-hash",
    ...overrides,
  };
}

async function loadUser() {
  return buildVerifiedUser();
}

async function createTestMobileSession(redis: MemoryRedis, nowMs = 1_800_000_000_000) {
  const handoff = await createMobileAuthHandoffToken(
    { callbackPath: "/channels", userId: "user-1" },
    { redis },
  );
  const response = await exchangeMobileAuthHandoffToken(
    handoff.token,
    { expectedCallbackPath: "/channels" },
    { env, loadUser, nowMs, redis },
  );
  assert.ok(response);
  assert.ok(response.session.tokens.refreshToken);
  return {
    ...response,
    session: {
      ...response.session,
      tokens: {
        ...response.session.tokens,
        refreshToken: response.session.tokens.refreshToken,
      },
    },
  };
}

function downgradeRefreshFamilyToLegacy(redis: MemoryRedis) {
  for (const [key, value] of redis.values) {
    if (!key.startsWith("auth:mobile-session:") && !key.startsWith("auth:mobile-refresh:")) {
      continue;
    }

    const record = JSON.parse(value) as Record<string, unknown>;
    delete record.familyId;
    delete record.generation;
    delete record.kind;
    delete record.currentGeneration;
    delete record.currentTokenHash;
    redis.values.set(key, JSON.stringify(record));
  }
}

async function getMobileNativeAuthFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    assert.ok(error instanceof MobileNativeAuthError);
    return {
      code: error.code,
      message: error.message,
      status: error.status,
    };
  }

  assert.fail("Expected mobile native auth to fail.");
}

describe("mobile auth handoff", () => {
  it("creates native password mobile sessions only for verified active users", async () => {
    const redis = new MemoryRedis();
    const passwordUser = buildPasswordUser();

    const response = await createMobilePasswordSession(
      {
        email: " Ada@Example.COM ",
        password: "correct-horse-battery",
      },
      {
        comparePassword: async (password, hash) =>
          password === "correct-horse-battery" && hash === "stored-hash",
        env,
        loadUserByEmail: async (email) => {
          assert.equal(email, "ada@example.com");
          return passwordUser;
        },
        loginAttemptStore: createMemoryAttemptStore(),
        nowMs: 1_800_000_000_000,
        redis,
      },
    );

    assert.equal(response?.session.user.id, "user-1");
    assert.equal(response?.session.tokens.tokenType, "Bearer");
    assert.equal(typeof response?.session.tokens.refreshToken, "string");
  });

  it("fails native password mobile sessions closed for wrong passwords and inactive users", async () => {
    const redis = new MemoryRedis();
    const passwordUser = buildPasswordUser();

    assert.equal(
      await createMobilePasswordSession(
        {
          email: "ada@example.com",
          password: "wrong-password",
        },
        {
          comparePassword: async () => false,
          env,
          loadUserByEmail: async () => passwordUser,
          loginAttemptStore: createMemoryAttemptStore(),
          redis,
        },
      ),
      null,
    );

    for (const inactiveUser of [
      buildPasswordUser({
        emailVerified: false,
      }),
      buildPasswordUser({
        deletedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      buildPasswordUser({
        isBanned: true,
      }),
    ]) {
      assert.equal(
        await createMobilePasswordSession(
          {
            email: "ada@example.com",
            password: "correct-horse-battery",
          },
          {
            comparePassword: async () => true,
            env,
            loadUserByEmail: async () => inactiveUser,
            loginAttemptStore: createMemoryAttemptStore(),
            redis,
          },
        ),
        null,
      );
    }
  });

  it("locks existing and unknown mobile login accounts without enumeration differences", async () => {
    const failures: Array<{ code: string; message: string; status: number }> = [];

    for (const user of [buildPasswordUser(), null]) {
      const loginAttemptStore = createMemoryAttemptStore();
      const redis = new MemoryRedis();
      let loadUserCalls = 0;
      let nowMs = 90_000;
      const options = {
        comparePassword: async () => false,
        env,
        loadUserByEmail: async () => {
          loadUserCalls += 1;
          return user;
        },
        loginAttemptStore,
        get nowMs() {
          return nowMs;
        },
        redis,
      };

      for (let attempt = 0; attempt < 4; attempt += 1) {
        assert.equal(
          await createMobilePasswordSession(
            { email: " Ada@Example.COM ", password: "wrong-password" },
            options,
          ),
          null,
        );
      }

      failures.push(
        await getMobileNativeAuthFailure(() =>
          createMobilePasswordSession(
            { email: " Ada@Example.COM ", password: "wrong-password" },
            options,
          ),
        ),
      );
      assert.equal(loadUserCalls, 5);

      await getMobileNativeAuthFailure(() =>
        createMobilePasswordSession(
          { email: "ada@example.com", password: "wrong-password" },
          options,
        ),
      );
      assert.equal(loadUserCalls, 5, "locked accounts must stop before database authentication");

      const key = getMobileLoginAttemptKey(" Ada@Example.COM ");
      assert.match(key, /^rate:mobile-login:account:[A-Za-z0-9_-]{43}$/);
      assert.equal(key.includes("ada@example.com"), false);
      assert.deepEqual(JSON.parse((await loginAttemptStore.get(key)) ?? "null"), {
        failures: 5,
        lockedUntilMs: 120_000,
      });

      nowMs = 120_000;
      await getMobileNativeAuthFailure(() =>
        createMobilePasswordSession(
          { email: "ada@example.com", password: "wrong-password" },
          options,
        ),
      );
      assert.equal(loadUserCalls, 6);
      assert.deepEqual(JSON.parse((await loginAttemptStore.get(key)) ?? "null"), {
        failures: 6,
        lockedUntilMs: 180_000,
      });
    }

    assert.deepEqual(failures, [
      {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Please try again shortly.",
        status: 429,
      },
      {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Please try again shortly.",
        status: 429,
      },
    ]);
  });

  it("resets mobile login account failures after a successful session", async () => {
    const loginAttemptStore = createMemoryAttemptStore();
    const redis = new MemoryRedis();
    const user = buildPasswordUser();
    let passwordIsValid = false;
    const options = {
      comparePassword: async () => passwordIsValid,
      env,
      loadUserByEmail: async () => user,
      loginAttemptStore,
      nowMs: 90_000,
      redis,
    };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.equal(
        await createMobilePasswordSession(
          { email: "ada@example.com", password: "wrong-password" },
          options,
        ),
        null,
      );
    }

    passwordIsValid = true;
    const response = await createMobilePasswordSession(
      { email: "ada@example.com", password: "correct-horse-battery" },
      options,
    );
    assert.equal(response?.session.user.id, user.id);
    assert.equal(await loginAttemptStore.get(getMobileLoginAttemptKey(user.email)), null);

    passwordIsValid = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.equal(
        await createMobilePasswordSession(
          { email: user.email, password: "wrong-password" },
          options,
        ),
        null,
      );
    }
    assert.deepEqual(
      await getMobileNativeAuthFailure(() =>
        createMobilePasswordSession({ email: user.email, password: "wrong-password" }, options),
      ),
      {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Please try again shortly.",
        status: 429,
      },
    );
  });

  it("rejects native registration when password confirmation does not match", async () => {
    await assert.rejects(
      () =>
        registerMobilePasswordAccount({
          confirmPassword: "different-password",
          email: "ada@example.com",
          password: "correct-horse-battery",
          username: "ada_lovelace",
        }),
      (error) =>
        error instanceof MobileNativeAuthError &&
        error.code === "PASSWORD_MISMATCH" &&
        error.status === 400,
    );
  });

  it("resends mobile verification emails only for active unverified accounts", async () => {
    const sentEmails: Array<{ email: string; locale: string | null | undefined }> = [];
    const response = await requestMobileVerificationEmail(
      {
        email: " Ada@Example.COM ",
        locale: "tr",
      },
      {
        loadUserByEmail: async (email) => {
          assert.equal(email, "ada@example.com");
          return buildPasswordUser({
            emailVerified: false,
          });
        },
        sendVerification: async (user, locale) => {
          sentEmails.push({ email: user.email, locale });
          return { expiresAt: new Date("2026-01-01T00:00:00.000Z") };
        },
      },
    );

    assert.deepEqual(response, {
      email: "ada@example.com",
      message: "verification_email_if_available",
      status: "accepted",
    });
    assert.deepEqual(sentEmails, [{ email: "ada@example.com", locale: "tr" }]);
  });

  it("does not reveal whether mobile verification email resend targets exist", async () => {
    const verifiedResponse = await requestMobileVerificationEmail(
      {
        email: "verified@example.com",
        locale: "en",
      },
      {
        loadUserByEmail: async () => buildPasswordUser(),
        sendVerification: async () => {
          throw new Error("verified accounts must not receive verification emails");
        },
      },
    );
    const missingResponse = await requestMobileVerificationEmail(
      {
        email: "missing@example.com",
        locale: "en",
      },
      {
        loadUserByEmail: async () => null,
        sendVerification: async () => {
          throw new Error("missing accounts must not receive verification emails");
        },
      },
    );

    assert.deepEqual(verifiedResponse, {
      email: "verified@example.com",
      message: "verification_email_if_available",
      status: "accepted",
    });
    assert.deepEqual(missingResponse, {
      email: "missing@example.com",
      message: "verification_email_if_available",
      status: "accepted",
    });
  });

  it("exchanges a safe single-use handoff for a signed mobile session", async () => {
    const redis = new MemoryRedis();
    const handoff = await createMobileAuthHandoffToken(
      { callbackPath: "/channels/@me", userId: "user-1" },
      { nowMs: 1_800_000_000_000, redis },
    );

    assert.equal(isMobileAuthHandoffToken(handoff.token), true);
    assert.equal(handoff.callbackPath, "/channels/@me");
    assert.equal(
      [...redis.values.keys()].some((key) => key.includes(handoff.token)),
      false,
    );

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

  it("rotates refresh tokens and returns the identical successor inside the grace window", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const refreshToken = response?.session.tokens.refreshToken;
    assert.equal(typeof refreshToken, "string");

    const rotatedAtMs = 1_800_000_060_000;
    const refreshed = await refreshMobileSession(refreshToken ?? "", {
      env,
      loadUser,
      nowMs: rotatedAtMs,
      redis,
    });
    assert.equal(refreshed?.session.user.id, "user-1");
    assert.notEqual(refreshed?.session.tokens.refreshToken, refreshToken);
    assert.equal(refreshed?.session.tokens.expiresAt, 1_800_000_960_000);

    // The rotated response can be lost in flight, leaving the device holding a
    // credential the server just destroyed. The grace window lets it retry.
    const replayedAtMs = rotatedAtMs + MOBILE_REFRESH_TOKEN_GRACE_MS;
    const replayed = await refreshMobileSession(refreshToken ?? "", {
      env,
      loadUser,
      nowMs: replayedAtMs,
      redis,
    });
    assert.equal(replayed?.session.user.id, "user-1");
    assert.notEqual(replayed?.session.tokens.refreshToken, refreshToken);
    assert.equal(replayed?.session.tokens.refreshToken, refreshed?.session.tokens.refreshToken);

    const rotatedClaims = verifyMobileAccessToken(refreshed?.session.tokens.accessToken ?? "", {
      env,
      nowMs: rotatedAtMs,
    });
    const replayedClaims = verifyMobileAccessToken(replayed?.session.tokens.accessToken ?? "", {
      env,
      nowMs: replayedAtMs,
    });
    assert.ok(rotatedClaims);
    assert.ok(replayedClaims);
    assert.equal(replayedClaims.sessionId, rotatedClaims.sessionId);
  });

  it("gives concurrent refresh requests one identical successor", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const refreshToken = response.session.tokens.refreshToken;
    const rotatedAtMs = 1_800_000_060_000;

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        refreshMobileSession(refreshToken, {
          env,
          loadUser,
          nowMs: rotatedAtMs,
          redis,
        }),
      ),
    );
    const successors = results.map((result) => result?.session.tokens.refreshToken);

    assert.equal(
      successors.every((token) => typeof token === "string"),
      true,
    );
    assert.equal(new Set(successors).size, 1);
    assert.notEqual(successors[0], refreshToken);
  });

  it("tracks family identity and monotonic generation in Redis", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const sessionEntry = [...redis.values.entries()].find(([key]) =>
      key.startsWith("auth:mobile-session:"),
    );
    assert.ok(sessionEntry);
    const initialSession = JSON.parse(sessionEntry[1]) as Record<string, unknown>;

    assert.equal(typeof initialSession.familyId, "string");
    assert.equal(initialSession.currentGeneration, 0);
    assert.equal(typeof initialSession.currentTokenHash, "string");

    await refreshMobileSession(response.session.tokens.refreshToken, {
      env,
      loadUser,
      nowMs: 1_800_000_060_000,
      redis,
    });
    const rotatedSession = JSON.parse(redis.values.get(sessionEntry[0]) ?? "null") as Record<
      string,
      unknown
    >;
    assert.equal(rotatedSession.familyId, initialSession.familyId);
    assert.equal(rotatedSession.currentGeneration, 1);
    assert.notEqual(rotatedSession.currentTokenHash, initialSession.currentTokenHash);
  });

  it("adopts an unconsumed legacy token into generation one atomically", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const accessClaims = verifyMobileAccessToken(response.session.tokens.accessToken, {
      env,
      nowMs: 1_800_000_000_000,
    });
    assert.ok(accessClaims);
    downgradeRefreshFamilyToLegacy(redis);

    const rotated = await refreshMobileSession(response.session.tokens.refreshToken, {
      env,
      loadUser,
      nowMs: 1_800_000_060_000,
      redis,
    });
    assert.ok(rotated);
    const sessionRaw = [...redis.values.entries()].find(([key]) =>
      key.startsWith("auth:mobile-session:"),
    )?.[1];
    assert.ok(sessionRaw);
    const session = JSON.parse(sessionRaw) as Record<string, unknown>;

    assert.equal(session.familyId, accessClaims.sessionId);
    assert.equal(session.currentGeneration, 1);
    assert.equal(typeof session.currentTokenHash, "string");
  });

  it("revokes a consumed legacy token that has no idempotent receipt", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const accessClaims = verifyMobileAccessToken(response.session.tokens.accessToken, {
      env,
      nowMs: 1_800_000_000_000,
    });
    assert.ok(accessClaims);
    downgradeRefreshFamilyToLegacy(redis);
    const tokenEntry = [...redis.values.entries()].find(([key]) =>
      key.startsWith("auth:mobile-refresh:"),
    );
    assert.ok(tokenEntry);
    const tokenRecord = JSON.parse(tokenEntry[1]) as Record<string, unknown>;
    tokenRecord.consumedAt = 1_800_000_030_000;
    redis.values.set(tokenEntry[0], JSON.stringify(tokenRecord));

    assert.equal(
      await refreshMobileSession(response.session.tokens.refreshToken, {
        env,
        loadUser,
        nowMs: 1_800_000_060_000,
        redis,
      }),
      null,
    );
    assert.equal(await isMobileAccessSessionActive(accessClaims, { redis }), false);
  });

  it("stores the retry successor only as a short-lived encrypted receipt", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const rotated = await refreshMobileSession(response.session.tokens.refreshToken, {
      env,
      loadUser,
      nowMs: 1_800_000_060_000,
      redis,
    });
    assert.ok(rotated);
    assert.ok(rotated.session.tokens.refreshToken);

    const receipts = [...redis.values.entries()].filter(([key]) =>
      key.startsWith("auth:mobile-refresh-retry:"),
    );
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.[1].includes(rotated.session.tokens.refreshToken), false);
    const receiptTtlSeconds = redis.ttlSeconds.get(receipts[0]?.[0] ?? "");
    assert.equal(typeof receiptTtlSeconds, "number");
    assert.ok((receiptTtlSeconds ?? Number.POSITIVE_INFINITY) <= 61);
  });

  it("revokes the token family after an old-generation replay outside grace", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const refreshToken = response.session.tokens.refreshToken;
    const rotatedAtMs = 1_800_000_060_000;

    const rotated = await refreshMobileSession(refreshToken, {
      env,
      loadUser,
      nowMs: rotatedAtMs,
      redis,
    });
    assert.ok(rotated);
    assert.ok(rotated.session.tokens.refreshToken);
    const rotatedClaims = verifyMobileAccessToken(rotated.session.tokens.accessToken, {
      env,
      nowMs: rotatedAtMs,
    });
    assert.ok(rotatedClaims);

    const expiredReplayAtMs = rotatedAtMs + MOBILE_REFRESH_TOKEN_GRACE_MS + 1;
    assert.equal(
      await refreshMobileSession(refreshToken, {
        env,
        loadUser,
        nowMs: expiredReplayAtMs,
        redis,
      }),
      null,
    );

    assert.equal(
      await refreshMobileSession(rotated.session.tokens.refreshToken, {
        env,
        loadUser,
        nowMs: expiredReplayAtMs,
        redis,
      }),
      null,
    );
    assert.equal(await isMobileAccessSessionActive(rotatedClaims, { redis }), false);
  });

  it("rejects a wrong refresh token hash without revoking the valid family", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const accessClaims = verifyMobileAccessToken(response.session.tokens.accessToken, {
      env,
      nowMs: 1_800_000_000_000,
    });
    assert.ok(accessClaims);

    assert.equal(
      await refreshMobileSession("x".repeat(64), {
        env,
        loadUser,
        nowMs: 1_800_000_060_000,
        redis,
      }),
      null,
    );
    assert.equal(await isMobileAccessSessionActive(accessClaims, { redis }), true);
  });

  it("fails closed when Redis is unavailable during refresh", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    redis.failEval = true;

    await assert.rejects(
      () =>
        refreshMobileSession(response.session.tokens.refreshToken, {
          env,
          loadUser,
          nowMs: 1_800_000_060_000,
          redis,
        }),
      /Redis temporarily unavailable/,
    );
  });

  it("stops honouring the grace window when the session is revoked", async () => {
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
    const refreshToken = response?.session.tokens.refreshToken ?? "";
    const rotatedAtMs = 1_800_000_060_000;

    const refreshed = await refreshMobileSession(refreshToken, {
      env,
      loadUser,
      nowMs: rotatedAtMs,
      redis,
    });
    await revokeMobileSession(
      { refreshToken: refreshed?.session.tokens.refreshToken ?? null },
      { redis },
    );

    assert.equal(
      await refreshMobileSession(refreshToken, { env, loadUser, nowMs: rotatedAtMs, redis }),
      null,
    );
  });

  it("revokes every refresh generation and access token in the family", async () => {
    const redis = new MemoryRedis();
    const response = await createTestMobileSession(redis);
    const originalRefreshToken = response.session.tokens.refreshToken;
    const rotated = await refreshMobileSession(originalRefreshToken, {
      env,
      loadUser,
      nowMs: 1_800_000_060_000,
      redis,
    });
    assert.ok(rotated);
    assert.ok(rotated.session.tokens.refreshToken);
    const accessClaims = verifyMobileAccessToken(rotated.session.tokens.accessToken, {
      env,
      nowMs: 1_800_000_060_000,
    });
    assert.ok(accessClaims);
    assert.equal(await isMobileAccessSessionActive(accessClaims, { redis }), true);

    await revokeMobileSession({ refreshToken: rotated.session.tokens.refreshToken }, { redis });

    assert.equal(await isMobileAccessSessionActive(accessClaims, { redis }), false);
    assert.equal(
      await refreshMobileSession(originalRefreshToken, {
        env,
        loadUser,
        redis,
      }),
      null,
    );
    assert.equal(
      await refreshMobileSession(rotated.session.tokens.refreshToken, {
        env,
        loadUser,
        redis,
      }),
      null,
    );
  });
});
