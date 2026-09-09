import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMemoryAttemptStore } from "../auth/attempt-tracker";
import {
  createMobileGoogleSession,
  createMobilePasswordSession,
  MobileNativeAuthError,
} from "./auth";

type MobilePasswordSessionOptions = NonNullable<Parameters<typeof createMobilePasswordSession>[1]>;

class MemoryRedis {
  readonly values = new Map<string, string>();

  async set(key: string, value: string, _mode: "EX", _ttlSeconds: number, condition: "NX") {
    if (condition === "NX" && this.values.has(key)) {
      return null;
    }

    this.values.set(key, value);
    return "OK" as const;
  }

  async eval(script: string, keyCount: number, ...input: string[]) {
    const keys = input.slice(0, keyCount);
    const args = input.slice(keyCount);
    if (script.includes("mobile-refresh-family:create-v2")) {
      const [sessionKey = "", familyKey = ""] = keys;
      if (this.values.has(sessionKey) || this.values.has(familyKey)) {
        return ["COLLISION"];
      }
      this.values.set(sessionKey, args[0] ?? "");
      this.values.set(familyKey, args[1] ?? "");
      return ["CREATED"];
    }

    const key = keys[0] ?? "";
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

const env: NodeJS.ProcessEnv = {
  AUTH_SECRET: "test-mobile-auth-secret",
  NODE_ENV: "test",
};

function buildPasswordUser(
  overrides: Partial<{
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    twoFactorSecretCiphertext: string | null;
    twoFactorSecretKeyVersion: string | null;
  }> = {},
) {
  return {
    avatarUrl: "https://whispr.team/avatar.png",
    deletedAt: null,
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    emailVerified: true,
    id: "user-1",
    isBanned: false,
    locale: "tr" as const,
    passwordHash: "stored-hash",
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorSecretCiphertext: null,
    twoFactorSecretKeyVersion: null,
    username: "ada",
    ...overrides,
  };
}

function buildGoogleUser(
  overrides: Partial<{
    twoFactorEnabled: boolean;
    twoFactorSecret: string | null;
    twoFactorSecretCiphertext: string | null;
    twoFactorSecretKeyVersion: string | null;
  }> = {},
) {
  return {
    avatarUrl: "https://whispr.team/avatar.png",
    deletedAt: null,
    displayName: "Ada Lovelace",
    emailVerified: true,
    id: "user-1",
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorSecretCiphertext: null,
    twoFactorSecretKeyVersion: null,
    username: "ada",
    ...overrides,
  };
}

function createOptions(
  user: ReturnType<typeof buildPasswordUser>,
  overrides: Partial<MobilePasswordSessionOptions> = {},
): MobilePasswordSessionOptions {
  return {
    comparePassword: async (password: string, hash: string) =>
      password === "correct-horse-battery" && hash === "stored-hash",
    env,
    loadUserByEmail: async () => user,
    loginAttemptStore: createMemoryAttemptStore(),
    nowMs: 1_800_000_000_000,
    redis: new MemoryRedis(),
    ...overrides,
  };
}

async function expectMobileAuthError(
  operation: () => Promise<unknown>,
  expected: { code: string; status: number },
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof MobileNativeAuthError);
    assert.equal(error.code, expected.code);
    assert.equal(error.status, expected.status);
    return true;
  });
}

/**
 * SPEC-GIRIS-KAYIT §4.2 — parola girişi artık iki şeyden birini döndürüyor: oturum ya da
 * challenge (paket kararı K2). Testler oturum dalını beklediği için daraltma yardımcısı.
 */
function expectSession<T extends object>(response: T | null | undefined) {
  assert.ok(response && "session" in response, "Beklenen oturum yanıtı gelmedi.");
  return response as Extract<T, { session: unknown }>;
}

describe("mobile password session two-factor enforcement", () => {
  it("requires a two-factor code after validating the password", async () => {
    const user = buildPasswordUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
    });

    await expectMobileAuthError(
      () =>
        createMobilePasswordSession(
          { email: user.email, password: "correct-horse-battery" },
          createOptions(user),
        ),
      { code: "TWO_FACTOR_REQUIRED", status: 401 },
    );
  });

  it("rejects an invalid two-factor code", async () => {
    const user = buildPasswordUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
    });

    await expectMobileAuthError(
      () =>
        createMobilePasswordSession(
          {
            email: user.email,
            password: "correct-horse-battery",
            twoFactorCode: "invalid-code",
          },
          createOptions(user, {
            verifyTwoFactor: async () => ({ error: "invalid_code", success: false }),
          }),
        ),
      { code: "TWO_FACTOR_INVALID", status: 401 },
    );
  });

  it("fails closed when two-factor replay protection is unavailable", async () => {
    const user = buildPasswordUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
    });

    await expectMobileAuthError(
      () =>
        createMobilePasswordSession(
          {
            email: user.email,
            password: "correct-horse-battery",
            twoFactorCode: "123456",
          },
          createOptions(user, {
            verifyTwoFactor: async () => ({
              error: "verification_unavailable",
              success: false,
            }),
          }),
        ),
      { code: "TWO_FACTOR_UNAVAILABLE", status: 503 },
    );
  });

  it("creates a session after a valid two-factor credential", async () => {
    const user = buildPasswordUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
      twoFactorSecretCiphertext: "encrypted-envelope",
      twoFactorSecretKeyVersion: "v1",
    });
    const calls: Array<{
      code: string;
      secret: string | null;
      secretCiphertext: string | null;
      secretKeyVersion: string | null;
      userId: string;
    }> = [];

    const response = await createMobilePasswordSession(
      {
        email: user.email,
        password: "correct-horse-battery",
        twoFactorCode: "123456",
      },
      createOptions(user, {
        verifyTwoFactor: async (input: {
          code: string;
          secret: string | null | undefined;
          secretCiphertext?: string | null;
          secretKeyVersion?: string | null;
          userId: string;
        }) => {
          calls.push({
            code: input.code,
            secret: input.secret ?? null,
            secretCiphertext: input.secretCiphertext ?? null,
            secretKeyVersion: input.secretKeyVersion ?? null,
            userId: input.userId,
          });
          return { success: true };
        },
      }),
    );

    assert.equal(expectSession(response).session.user.id, user.id);
    assert.deepEqual(calls, [
      {
        code: "123456",
        secret: user.twoFactorSecret,
        secretCiphertext: user.twoFactorSecretCiphertext,
        secretKeyVersion: user.twoFactorSecretKeyVersion,
        userId: user.id,
      },
    ]);
  });

  it("keeps password-only sign-in behavior when two-factor is disabled", async () => {
    const user = buildPasswordUser();

    const response = await createMobilePasswordSession(
      { email: user.email, password: "correct-horse-battery" },
      createOptions(user, {
        verifyTwoFactor: async () => {
          assert.fail("Two-factor verification must not run when disabled.");
          return { success: true };
        },
      }),
    );

    assert.equal(expectSession(response).session.user.id, user.id);
  });

  it("does not invoke two-factor verification for an invalid password", async () => {
    const user = buildPasswordUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
    });
    let verifyCalls = 0;

    const response = await createMobilePasswordSession(
      {
        email: user.email,
        password: "wrong-password",
        twoFactorCode: "123456",
      },
      createOptions(user, {
        verifyTwoFactor: async () => {
          verifyCalls += 1;
          return { success: true };
        },
      }),
    );

    assert.equal(response, null);
    assert.equal(verifyCalls, 0);
  });

  it("preserves two-factor rate limits", async () => {
    const user = buildPasswordUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
    });

    await expectMobileAuthError(
      () =>
        createMobilePasswordSession(
          {
            email: user.email,
            password: "correct-horse-battery",
            twoFactorCode: "123456",
          },
          createOptions(user, {
            verifyTwoFactor: async () => ({
              error: "rate_limited",
              retryAfterSeconds: 30,
              success: false,
            }),
          }),
        ),
      { code: "RATE_LIMITED", status: 429 },
    );
  });
});

describe("mobile Google session two-factor enforcement", () => {
  it("rejects a missing code before linking an existing two-factor account", async () => {
    const redis = new MemoryRedis();
    const user = buildGoogleUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
    });
    const calls: string[] = [];

    await expectMobileAuthError(
      () =>
        createMobileGoogleSession(
          { idToken: "verified-google-id-token" },
          {
            env,
            linkAccount: async (linkInput) => {
              await linkInput.authorizeExistingUser(user);
              calls.push("link");
              return user;
            },
            nowMs: 1_800_000_000_000,
            redis,
            verifyIdToken: async () => ({
              avatarUrl: "https://whispr.team/avatar.png",
              email: "ada@example.com",
              emailVerified: true,
              name: "Ada Lovelace",
              subject: "google-user-1",
            }),
          },
        ),
      { code: "TWO_FACTOR_REQUIRED", status: 401 },
    );

    assert.deepEqual(calls, []);
    assert.equal(redis.values.size, 0);
  });

  it("rejects an invalid code before linking or creating session state", async () => {
    const redis = new MemoryRedis();
    const user = buildGoogleUser({
      twoFactorEnabled: true,
      twoFactorSecret: "two-factor-secret",
    });
    const calls: string[] = [];

    await expectMobileAuthError(
      () =>
        createMobileGoogleSession(
          { idToken: "verified-google-id-token", twoFactorCode: "wrong-code" },
          {
            env,
            linkAccount: async (linkInput) => {
              await linkInput.authorizeExistingUser(user);
              calls.push("link");
              return user;
            },
            nowMs: 1_800_000_000_000,
            redis,
            verifyIdToken: async () => ({
              avatarUrl: "https://whispr.team/avatar.png",
              email: "ada@example.com",
              emailVerified: true,
              name: "Ada Lovelace",
              subject: "google-user-1",
            }),
            verifyTwoFactor: async () => ({ error: "invalid_code", success: false }),
          },
        ),
      { code: "TWO_FACTOR_INVALID", status: 401 },
    );

    assert.deepEqual(calls, []);
    assert.equal(redis.values.size, 0);
  });

  it("links and creates a session only after a valid two-factor credential", async () => {
    const redis = new MemoryRedis();
    const user = buildGoogleUser({
      twoFactorEnabled: true,
      twoFactorSecret: "legacy-secret",
      twoFactorSecretCiphertext: "encrypted-envelope",
      twoFactorSecretKeyVersion: "v1",
    });
    const calls: string[] = [];

    const response = await createMobileGoogleSession(
      { idToken: "verified-google-id-token", twoFactorCode: "recovery-code" },
      {
        env,
        linkAccount: async (linkInput) => {
          await linkInput.authorizeExistingUser(user);
          calls.push("link");
          return user;
        },
        nowMs: 1_800_000_000_000,
        redis,
        verifyIdToken: async () => ({
          avatarUrl: "https://whispr.team/avatar.png",
          email: "ada@example.com",
          emailVerified: true,
          name: "Ada Lovelace",
          subject: "google-user-1",
        }),
        verifyTwoFactor: async (input) => {
          assert.deepEqual(input, {
            code: "recovery-code",
            secret: "legacy-secret",
            secretCiphertext: "encrypted-envelope",
            secretKeyVersion: "v1",
            userId: "user-1",
          });
          calls.push("verify-two-factor");
          return { success: true };
        },
      },
    );

    assert.equal(response.session.user.id, user.id);
    assert.deepEqual(calls, ["verify-two-factor", "link"]);
    assert.notEqual(redis.values.size, 0);
  });
});
