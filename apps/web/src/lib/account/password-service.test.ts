import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PASSWORD_MIN_LENGTH,
  changeAccountPassword,
  checkPasswordChangeRateLimit,
  checkPasswordPolicy,
  recordPasswordChangeFailure,
  type ChangeAccountPasswordDependencies,
  type PasswordRateLimitDependencies,
} from "./password-service";

const now = new Date("2026-08-24T09:00:00.000Z");

function createDependencies(overrides: Partial<ChangeAccountPasswordDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: ChangeAccountPasswordDependencies = {
    comparePassword: async (password, passwordHash) => {
      calls.push(`compare:${password}:${passwordHash}`);
      return passwordHash === `hashed:${password}`;
    },
    hashPassword: async (password) => `hashed:${password}`,
    loadUser: async () => ({
      deletedAt: null,
      isBanned: false,
      passwordHash: "hashed:Old-Secret-1",
    }),
    now: () => now,
    revokeSessions: async (userId) => {
      calls.push(`revoke:${userId}`);
    },
    savePassword: async (userId, passwordHash) => {
      calls.push(`save:${userId}:${passwordHash}`);
    },
    ...overrides,
  };

  return { calls, dependencies };
}

const input = {
  currentPassword: "Old-Secret-1",
  newPassword: "Brand-New-Secret-2",
  userId: "user-1",
};

describe("password policy", () => {
  it("matches the help text: ten characters, one digit, one uppercase", () => {
    assert.equal(PASSWORD_MIN_LENGTH, 10);
    assert.deepEqual(checkPasswordPolicy("Correct-Horse-1"), []);
    assert.deepEqual(checkPasswordPolicy("Short-1"), ["length"]);
    assert.deepEqual(checkPasswordPolicy("correct-horse-1"), ["uppercase"]);
    assert.deepEqual(checkPasswordPolicy("Correct-Horse-Battery"), ["digit"]);
    assert.deepEqual(checkPasswordPolicy("short"), ["length", "digit", "uppercase"]);
  });

  it("rejects a password bcrypt would silently truncate", () => {
    assert.deepEqual(checkPasswordPolicy(`A1${"x".repeat(100)}`), ["maxLength"]);
    assert.deepEqual(checkPasswordPolicy(`A1${"é".repeat(40)}`), ["maxLength"]);
  });

  it("reports reuse of the current password as its own rule", () => {
    assert.deepEqual(
      checkPasswordPolicy("Correct-Horse-1", { currentPassword: "Correct-Horse-1" }),
      ["reused"],
    );
    assert.deepEqual(
      checkPasswordPolicy("Correct-Horse-1", { currentPassword: "Something-Else-2" }),
      [],
    );
  });
});

describe("changeAccountPassword", () => {
  it("compares, saves and revokes in that order", async () => {
    const { calls, dependencies } = createDependencies();

    const result = await changeAccountPassword(input, dependencies);

    assert.deepEqual(result, { changedAt: now, ok: true });
    assert.deepEqual(calls, [
      "compare:Old-Secret-1:hashed:Old-Secret-1",
      "save:user-1:hashed:Brand-New-Secret-2",
      "revoke:user-1",
    ]);
  });

  it("leaves the stored hash alone when the current password is wrong", async () => {
    const { calls, dependencies } = createDependencies({
      comparePassword: async () => false,
      revokeSessions: async () => {
        throw new Error("must not run");
      },
      savePassword: async () => {
        throw new Error("must not run");
      },
    });

    assert.deepEqual(await changeAccountPassword(input, dependencies), {
      ok: false,
      reason: "invalid_current_password",
    });
    assert.deepEqual(calls, []);
  });

  it("reports deleted, banned, missing and password-less accounts distinctly", async () => {
    const missing = await changeAccountPassword(
      input,
      createDependencies({ loadUser: async () => null }).dependencies,
    );
    const deleted = await changeAccountPassword(
      input,
      createDependencies({
        loadUser: async () => ({ deletedAt: now, isBanned: false, passwordHash: "x" }),
      }).dependencies,
    );
    const banned = await changeAccountPassword(
      input,
      createDependencies({
        loadUser: async () => ({ deletedAt: null, isBanned: true, passwordHash: "x" }),
      }).dependencies,
    );
    const oauthOnly = await changeAccountPassword(
      input,
      createDependencies({
        loadUser: async () => ({ deletedAt: null, isBanned: false, passwordHash: null }),
      }).dependencies,
    );

    assert.deepEqual(missing, { ok: false, reason: "user_not_found" });
    assert.deepEqual(deleted, { ok: false, reason: "user_not_found" });
    assert.deepEqual(banned, { ok: false, reason: "user_not_found" });
    assert.deepEqual(oauthOnly, { ok: false, reason: "password_unavailable" });
  });

  it("passes one instant to both the write and the revocation", async () => {
    const stamps: Date[] = [];
    const { dependencies } = createDependencies({
      revokeSessions: async (_userId, at) => {
        stamps.push(at);
      },
      savePassword: async (_userId, _hash, at) => {
        stamps.push(at);
      },
    });

    await changeAccountPassword(input, dependencies);

    assert.equal(stamps.length, 2);
    assert.equal(stamps[0]?.getTime(), stamps[1]?.getTime());
  });
});

function createRateLimitDependencies(allow: boolean | boolean[] = true) {
  const keys: Array<{ key: string; limit: number; windowSeconds: number }> = [];
  const answers = Array.isArray(allow) ? [...allow] : null;
  const dependencies: PasswordRateLimitDependencies = {
    checkRateLimit: (async (_redis: unknown, key: string, limit: number, windowSeconds: number) => {
      keys.push({ key, limit, windowSeconds });
      return answers ? (answers.shift() ?? true) : allow === true;
    }) as PasswordRateLimitDependencies["checkRateLimit"],
    getRedisRate: (() => ({})) as PasswordRateLimitDependencies["getRedisRate"],
    logError: (() => undefined) as PasswordRateLimitDependencies["logError"],
  };

  return { dependencies, keys };
}

const subject = { headers: { get: () => null }, userId: "user-1" };

describe("password change rate limit", () => {
  it("spends a network and a subject budget per request", async () => {
    const { dependencies, keys } = createRateLimitDependencies(true);

    assert.equal(await checkPasswordChangeRateLimit(subject, dependencies), true);
    assert.equal(keys.length, 2);
    assert.match(String(keys[0]?.key), /^rate:auth:account:password:request:network:/);
    assert.match(String(keys[1]?.key), /^rate:auth:account:password:request:subject:/);
    assert.deepEqual(
      keys.map(({ windowSeconds }) => windowSeconds),
      [900, 900],
    );
  });

  it("spends a separate, tighter budget on a wrong current password", async () => {
    const { dependencies, keys } = createRateLimitDependencies(true);

    await recordPasswordChangeFailure(subject, dependencies);

    assert.match(String(keys[0]?.key), /^rate:auth:account:password:failure:network:/);
    assert.match(String(keys[1]?.key), /^rate:auth:account:password:failure:subject:/);
    assert.equal(keys[1]?.limit, 5);
    // The failure bucket must be tighter than the request bucket, or it changes nothing.
    const request = createRateLimitDependencies(true);
    await checkPasswordChangeRateLimit(subject, request.dependencies);
    assert.equal(Number(keys[1]?.limit) < Number(request.keys[1]?.limit), true);
  });

  it("refuses when either layer is exhausted", async () => {
    const network = createRateLimitDependencies([false, true]);
    const account = createRateLimitDependencies([true, false]);

    assert.equal(await checkPasswordChangeRateLimit(subject, network.dependencies), false);
    assert.equal(await checkPasswordChangeRateLimit(subject, account.dependencies), false);
  });

  it("fails closed when the limiter itself is unavailable", async () => {
    const logged: string[] = [];
    const dependencies: PasswordRateLimitDependencies = {
      checkRateLimit: (() => {
        throw new Error("redis down");
      }) as PasswordRateLimitDependencies["checkRateLimit"],
      getRedisRate: (() => ({})) as PasswordRateLimitDependencies["getRedisRate"],
      logError: ((scope: string) => {
        logged.push(scope);
      }) as PasswordRateLimitDependencies["logError"],
    };

    assert.equal(await checkPasswordChangeRateLimit(subject, dependencies), false);
    assert.deepEqual(logged, ["[auth-rate-limit] account:password unavailable"]);
  });

  it("gives two accounts different subject buckets", async () => {
    const first = createRateLimitDependencies(true);
    const second = createRateLimitDependencies(true);

    await checkPasswordChangeRateLimit(subject, first.dependencies);
    await checkPasswordChangeRateLimit(
      { headers: { get: () => null }, userId: "user-2" },
      second.dependencies,
    );

    assert.notEqual(first.keys[1]?.key, second.keys[1]?.key);
  });
});
