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
  MobileNativeAuthError,
  refreshMobileSession,
  registerMobilePasswordAccount,
  requestMobileVerificationEmail,
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
  email?: string;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  locale?: string | null;
  passwordHash?: string | null;
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
        createMobilePasswordSession(
          { email: user.email, password: "wrong-password" },
          options,
        ),
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
