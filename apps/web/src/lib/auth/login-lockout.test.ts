import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMemoryAttemptStore } from "@/lib/auth/attempt-tracker";
import {
  LOGIN_LOCK_DURATION_MS,
  LOGIN_MAX_ATTEMPTS,
  createLoginLockout,
} from "@/lib/auth/login-lockout";

/**
 * SPEC-GIRIS-KAYIT §10 — "5 başarısız girişte hesap 15 dakika kilitlenir".
 *
 * Ekran iki sayıyı da gösteriyor (`3 deneme kaldı` ve `Kalan süre 14:32`), bu yüzden sayacın
 * kendisi kadar **kalan** değerleri de sözleşmenin parçası.
 */

function createHarness(startMs = 1_700_000_000_000) {
  let now = startMs;
  const store = createMemoryAttemptStore();
  const lockout = createLoginLockout({
    getRedisRate: () => {
      throw new Error("Redis kullanılmamalı — test bellek deposu veriyor.");
    },
    logError: () => {},
    nowMs: () => now,
    store,
  });

  return {
    advance(ms: number) {
      now += ms;
    },
    lockout,
  };
}

const ADA = { clientIp: "203.0.113.7", email: "ada@example.com" };

describe("login lockout", () => {
  it("starts with the full attempt budget", async () => {
    const { lockout } = createHarness();

    assert.deepEqual(await lockout.peek(ADA), {
      attemptsLeft: LOGIN_MAX_ATTEMPTS,
      status: "ok",
    });
  });

  it("counts down to the SPEC message after four failures", async () => {
    const { lockout } = createHarness();

    assert.deepEqual(await lockout.registerFailure(ADA), { attemptsLeft: 4, status: "ok" });
    assert.deepEqual(await lockout.registerFailure(ADA), { attemptsLeft: 3, status: "ok" });
    assert.deepEqual(await lockout.registerFailure(ADA), { attemptsLeft: 2, status: "ok" });
    assert.deepEqual(await lockout.registerFailure(ADA), { attemptsLeft: 1, status: "ok" });
    assert.deepEqual(await lockout.peek(ADA), { attemptsLeft: 1, status: "ok" });
  });

  it("locks for fifteen minutes on the fifth failure", async () => {
    const { lockout } = createHarness();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS - 1; attempt += 1) {
      await lockout.registerFailure(ADA);
    }

    const fifth = await lockout.registerFailure(ADA);

    assert.equal(fifth.status, "locked");
    if (fifth.status === "locked") {
      assert.ok(fifth.retryAfterMs > LOGIN_LOCK_DURATION_MS - 2_000);
      assert.ok(fifth.retryAfterMs <= LOGIN_LOCK_DURATION_MS);
    }
  });

  it("keeps rejecting while locked, even with the right password", async () => {
    const { advance, lockout } = createHarness();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      await lockout.registerFailure(ADA);
    }

    advance(60_000);
    const state = await lockout.peek(ADA);

    assert.equal(state.status, "locked");
    if (state.status === "locked") {
      // Ondört dakika kaldı — SPEC §7/2'nin `Kalan süre 14:32` bandı bu değeri biçimler.
      assert.ok(state.retryAfterMs > 13 * 60_000);
      assert.ok(state.retryAfterMs <= 14 * 60_000);
    }
  });

  it("opens again once the lock expires", async () => {
    const { advance, lockout } = createHarness();

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      await lockout.registerFailure(ADA);
    }

    advance(LOGIN_LOCK_DURATION_MS + 1_000);

    assert.deepEqual(await lockout.peek(ADA), {
      attemptsLeft: LOGIN_MAX_ATTEMPTS,
      status: "ok",
    });
  });

  it("never lets one account lock another", async () => {
    const { lockout } = createHarness();
    const grace = { clientIp: "198.51.100.4", email: "grace@example.com" };

    for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      await lockout.registerFailure(ADA);
    }

    assert.deepEqual(await lockout.peek(grace), {
      attemptsLeft: LOGIN_MAX_ATTEMPTS,
      status: "ok",
    });
  });

  it("clears the counter on a completed sign-in", async () => {
    const { lockout } = createHarness();

    await lockout.registerFailure(ADA);
    await lockout.registerFailure(ADA);
    await lockout.reset(ADA);

    assert.deepEqual(await lockout.peek(ADA), {
      attemptsLeft: LOGIN_MAX_ATTEMPTS,
      status: "ok",
    });
  });

  it("still counts when the client IP is unknown", async () => {
    const { lockout } = createHarness();
    const anonymous = { clientIp: null, email: "ada@example.com" };

    await lockout.registerFailure(anonymous);

    assert.deepEqual(await lockout.peek(anonymous), { attemptsLeft: 4, status: "ok" });
  });

  it("locks a network that sprays many accounts", async () => {
    const { lockout } = createHarness();

    // Yirmi beş farklı hesaba birer deneme: hiçbir hesap kilitlenmez ama ağ kilitlenir.
    for (let index = 0; index < 25; index += 1) {
      await lockout.registerFailure({ clientIp: "203.0.113.9", email: `user${index}@example.com` });
    }

    const fresh = await lockout.peek({ clientIp: "203.0.113.9", email: "victim@example.com" });

    assert.equal(fresh.status, "locked");
  });

  it("normalizes the email before hashing", async () => {
    const { lockout } = createHarness();

    await lockout.registerFailure({ clientIp: null, email: "  ADA@Example.com " });

    assert.deepEqual(await lockout.peek({ clientIp: null, email: "ada@example.com" }), {
      attemptsLeft: 4,
      status: "ok",
    });
  });
});
