import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMemoryAttemptStore } from "../auth/attempt-tracker";
import { createMobilePasswordSession, MobileNativeAuthError } from "./auth";

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
    if (script.includes("mobile-refresh-family:create-v1")) {
      const [sessionKey = "", refreshTokenKey = ""] = keys;
      if (this.values.has(sessionKey) || this.values.has(refreshTokenKey)) {
        return ["COLLISION"];
      }
      this.values.set(sessionKey, args[0] ?? "");
      this.values.set(refreshTokenKey, args[1] ?? "");
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

    assert.equal(response?.session.user.id, user.id);
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

    assert.equal(response?.session.user.id, user.id);
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
