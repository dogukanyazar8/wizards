import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMemoryAttemptStore } from "@/lib/auth/attempt-tracker";
import { createLoginChallengeStore, createMemoryChallengeStore } from "@/lib/auth/login-challenge";
import type { LoginCredentialUser } from "@/lib/auth/login-credentials";
import type { TrustedDeviceUser } from "./trusted-device";
import { createLoginLockout } from "@/lib/auth/login-lockout";
import { submitBackupCode, submitTwoFactorCode } from "@/lib/auth/two-factor-login";

/**
 * SPEC-GIRIS-KAYIT §4.2 / §4.3 ikinci adımının sözleşmesi.
 *
 * Ekran dört sonucu ayırt etmek zorunda: doğru kod, yanlış kod (kalan deneme), süresi geçmiş
 * challenge ve kilitlenmiş hesap. Testler dördünü de sabitliyor.
 */

const CONTEXT = { clientIp: "203.0.113.7", userAgent: "Mozilla/5.0 (Whispr Test)" };

const USER: LoginCredentialUser = {
  avatarUrl: null,
  deletedAt: null,
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  emailVerified: true,
  id: "user_ada",
  isBanned: false,
  locale: "tr",
  passwordHash: "hash",
  sessionsRevokedAfter: null,
  theme: "theme-light",
  twoFactorEnabled: true,
  twoFactorSecret: "secret",
  twoFactorSecretCiphertext: null,
  twoFactorSecretKeyVersion: null,
  username: "ada",
};

function createHarness(options: { user?: LoginCredentialUser | null } = {}) {
  let now = 1_700_000_000_000;
  let counter = 0;
  const challenges = createLoginChallengeStore({
    isProduction: false,
    logError: () => {},
    nowMs: () => now,
    randomToken: () => {
      counter += 1;
      return `token-${counter}`.padEnd(32, "x");
    },
    store: createMemoryChallengeStore(() => now),
  });
  const lockout = createLoginLockout({
    logError: () => {},
    nowMs: () => now,
    store: createMemoryAttemptStore(),
  });

  const verified = new Set<string>(["481029", "7QF42KDX9M"]);

  return {
    advance(ms: number) {
      now += ms;
    },
    challenges,
    dependencies: {
      challenges,
      findUser: async () => (options.user === undefined ? USER : options.user),
      lockout,
      verifyCode: async ({ code }: { code: string }) =>
        verified.has(code.trim())
          ? ({ success: true } as const)
          : ({ error: "invalid_code", success: false } as const),
    },
    lockout,
  };
}

async function issueChallenge(harness: ReturnType<typeof createHarness>) {
  return harness.challenges.issue({
    clientIp: CONTEXT.clientIp,
    email: USER.email,
    redirectTo: "/channels",
    rememberMe: true,
    userAgent: CONTEXT.userAgent,
    userId: USER.id,
  });
}

describe("two-factor login", () => {
  it("remembers only an explicitly selected, successfully consumed second factor", async () => {
    const harness = createHarness();
    const issued: string[] = [];
    const dependencies = {
      ...harness.dependencies,
      issueTrustedDevice: async (user: TrustedDeviceUser, userAgent: string | null | undefined) => {
        assert.equal(userAgent, CONTEXT.userAgent);
        issued.push(user.id);
        return "trusted-token";
      },
    };
    const challengeId = await issueChallenge(harness);
    assert.equal(
      (
        await submitTwoFactorCode(
          { challengeId, code: "000000", rememberDevice: true },
          CONTEXT,
          dependencies,
        )
      ).status,
      "codeInvalid",
    );
    assert.deepEqual(issued, []);
    const result = await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: true },
      CONTEXT,
      dependencies,
    );
    assert.equal(result.status, "ok");
    if (result.status === "ok") assert.equal(result.trustedDeviceToken, "trusted-token");
    assert.deepEqual(issued, [USER.id]);
    assert.equal(
      (
        await submitTwoFactorCode(
          { challengeId, code: "481029", rememberDevice: true },
          CONTEXT,
          dependencies,
        )
      ).status,
      "challengeExpired",
    );
    assert.deepEqual(issued, [USER.id]);
    const unchecked = await submitTwoFactorCode(
      { challengeId: await issueChallenge(harness), code: "481029", rememberDevice: false },
      CONTEXT,
      dependencies,
    );
    assert.equal(unchecked.status, "ok");
    assert.equal("trustedDeviceToken" in unchecked, false);
    assert.deepEqual(issued, [USER.id]);
  });
  it("mints a ticket for the right code", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    const result = await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.equal(result.email, USER.email);
      assert.equal(result.redirectTo, "/channels");
      assert.ok(result.ticket.length >= 24);
    }
  });

  it("remembers a verified recovery-code login only when requested", async () => {
    const harness = createHarness();
    let issued = 0;
    const result = await submitBackupCode(
      {
        challengeId: await issueChallenge(harness),
        backupCode: "7QF42KDX9M",
        rememberDevice: true,
      },
      CONTEXT,
      {
        ...harness.dependencies,
        issueTrustedDevice: async () => {
          issued++;
          return "trusted-token";
        },
      },
    );
    assert.equal(result.status, "ok");
    assert.equal(issued, 1);
    if (result.status === "ok") assert.equal(result.trustedDeviceToken, "trusted-token");
  });

  it("never claims the device was remembered if durable enrollment fails", async () => {
    const harness = createHarness();
    const result = await submitTwoFactorCode(
      { challengeId: await issueChallenge(harness), code: "481029", rememberDevice: true },
      CONTEXT,
      {
        ...harness.dependencies,
        issueTrustedDevice: async () => {
          throw new Error("test storage unavailable");
        },
      },
    );
    assert.equal(result.status, "unavailable");
    assert.equal("trustedDeviceToken" in result, false);
  });

  it("consumes the challenge so the code cannot be replayed", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );
    const replay = await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    assert.equal(replay.status, "challengeExpired");
  });

  it("reports the remaining attempts on a wrong code", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    const first = await submitTwoFactorCode(
      { challengeId, code: "000000", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    assert.deepEqual(first, { attemptsLeft: 2, status: "codeInvalid" });
  });

  it("drops the challenge after the third wrong code", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    await submitTwoFactorCode(
      { challengeId, code: "000000", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );
    await submitTwoFactorCode(
      { challengeId, code: "000000", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );
    const third = await submitTwoFactorCode(
      { challengeId, code: "000000", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    assert.equal(third.status, "challengeExpired");
  });

  it("locks the account when wrong codes exhaust the login budget", async () => {
    const harness = createHarness();

    // Beş yanlış kod, her biri yeni bir challenge ile: giriş kilidi sayacını doldurur.
    let last = await submitTwoFactorCode(
      { challengeId: await issueChallenge(harness), code: "000000", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    for (let attempt = 0; attempt < 4; attempt += 1) {
      last = await submitTwoFactorCode(
        { challengeId: await issueChallenge(harness), code: "000000", rememberDevice: false },
        CONTEXT,
        harness.dependencies,
      );
    }

    assert.equal(last.status, "accountLocked");
    if (last.status === "accountLocked") {
      assert.ok(last.retryAfterMs > 14 * 60_000);
    }
  });

  it("refuses an expired challenge", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    harness.advance(6 * 60_000);

    const result = await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    assert.equal(result.status, "challengeExpired");
  });

  it("refuses a challenge presented from another browser", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    const result = await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: false },
      { clientIp: "198.51.100.9", userAgent: "curl/8.0" },
      harness.dependencies,
    );

    assert.equal(result.status, "challengeExpired");
  });

  it("refuses a challenge whose account was banned meanwhile", async () => {
    const harness = createHarness({ user: { ...USER, isBanned: true } });
    const challengeId = await issueChallenge(harness);

    const result = await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    assert.equal(result.status, "challengeExpired");
  });

  it("accepts a backup code through the same path", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    const result = await submitBackupCode(
      { backupCode: "7QF42KDX9M", challengeId },
      CONTEXT,
      harness.dependencies,
    );

    assert.equal(result.status, "ok");
  });

  it("surfaces an unavailable verifier instead of failing the code", async () => {
    const harness = createHarness();
    const challengeId = await issueChallenge(harness);

    const result = await submitTwoFactorCode(
      { challengeId, code: "481029", rememberDevice: false },
      CONTEXT,
      {
        ...harness.dependencies,
        verifyCode: async () => ({ error: "verification_unavailable", success: false }) as const,
      },
    );

    assert.equal(result.status, "unavailable");
  });

  it("clears the login lockout counter after a completed second step", async () => {
    const harness = createHarness();

    await submitTwoFactorCode(
      { challengeId: await issueChallenge(harness), code: "000000", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );
    await submitTwoFactorCode(
      { challengeId: await issueChallenge(harness), code: "481029", rememberDevice: false },
      CONTEXT,
      harness.dependencies,
    );

    assert.deepEqual(
      await harness.lockout.peek({ clientIp: CONTEXT.clientIp, email: USER.email }),
      {
        attemptsLeft: 5,
        status: "ok",
      },
    );
  });
});
