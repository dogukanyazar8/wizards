import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTotpSecretKeyring, resolveTotpSecret } from "./totp-secret-encryption";
import { generateTotpCode, hashRecoveryCode } from "./totp";
import type { RecordSecurityEventInput } from "@/lib/security/security-event-service";
import {
  confirmTwoFactorSetup,
  createMemoryTwoFactorAttemptStore,
  disableTwoFactor,
  formatManualEntryKey,
  getRecoveryCodeStatus,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  verifyTwoFactorCredential,
  type TwoFactorRepository,
  type TwoFactorServiceDependencies,
} from "./two-factor";

const userId = "user-1";
const rfc6238Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const keyring = parseTotpSecretKeyring({
  TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: "v1",
  TOTP_SECRET_ENCRYPTION_KEYS: JSON.stringify({
    v1: Buffer.alloc(32, 0x66).toString("base64url"),
  }),
});

function createHarness() {
  let replayUnavailable = false;
  const replayKeys = new Set<string>();
  const user = {
    email: "ada@example.test",
    id: userId,
    passwordHash: "correct-password",
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
    twoFactorSecretCiphertext: null as string | null,
    twoFactorSecretKeyVersion: null as string | null,
  };
  const recoveryCodes: Array<{
    codeHash: string;
    id: string;
    usedAt: Date | null;
    userId: string;
  }> = [];

  const repository: TwoFactorRepository = {
    async consumeRecoveryCode(codeId) {
      const code = recoveryCodes.find((entry) => entry.id === codeId && !entry.usedAt);
      if (!code) {
        return false;
      }

      code.usedAt = new Date("2026-07-09T00:00:00.000Z");
      return true;
    },
    async countRecoveryCodes(targetUserId) {
      const owned = recoveryCodes.filter((entry) => entry.userId === targetUserId);
      return {
        total: owned.length,
        unused: owned.filter((entry) => !entry.usedAt).length,
      };
    },
    async disableTwoFactor(targetUserId) {
      assert.equal(targetUserId, userId);
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.twoFactorSecretCiphertext = null;
      user.twoFactorSecretKeyVersion = null;
      recoveryCodes.length = 0;
    },
    async enableTwoFactor(targetUserId, secret, recoveryCodeHashes) {
      assert.equal(targetUserId, userId);
      user.twoFactorEnabled = true;
      user.twoFactorSecret = null;
      user.twoFactorSecretCiphertext = secret.ciphertext;
      user.twoFactorSecretKeyVersion = secret.keyVersion;
      recoveryCodes.length = 0;
      recoveryCodes.push(
        ...recoveryCodeHashes.map((codeHash, index) => ({
          codeHash,
          id: `recovery-${index}`,
          usedAt: null,
          userId,
        })),
      );
    },
    async findUserForTwoFactor(targetUserId) {
      return targetUserId === userId ? { ...user } : null;
    },
    async listUnusedRecoveryCodes(targetUserId) {
      return recoveryCodes
        .filter((entry) => entry.userId === targetUserId && !entry.usedAt)
        .map((entry) => ({
          codeHash: entry.codeHash,
          id: entry.id,
          usedAt: entry.usedAt,
        }));
    },
    async replaceRecoveryCodes(targetUserId, recoveryCodeHashes) {
      assert.equal(targetUserId, userId);
      recoveryCodes.length = 0;
      recoveryCodes.push(
        ...recoveryCodeHashes.map((codeHash, index) => ({
          codeHash,
          id: `recovery-fresh-${index}`,
          usedAt: null,
          userId,
        })),
      );
    },
    async savePendingSecret(targetUserId, secret) {
      assert.equal(targetUserId, userId);
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      user.twoFactorSecretCiphertext = secret.ciphertext;
      user.twoFactorSecretKeyVersion = secret.keyVersion;
    },
  };

  const securityEvents: RecordSecurityEventInput[] = [];

  const dependencies: TwoFactorServiceDependencies = {
    attemptStore: createMemoryTwoFactorAttemptStore(),
    comparePassword: async (password, passwordHash) => password === passwordHash,
    createQrCodeDataUrl: async (otpauthUri) => `data:image/svg+xml,${otpauthUri}`,
    keyring,
    nowMs: () => 90_000,
    randomBytes: () => Buffer.from("12345678901234567890"),
    recordEvent: async (input) => {
      securityEvents.push(input);
    },
    replayStore: {
      async consume(input) {
        if (replayUnavailable) {
          throw new Error("Redis unavailable.");
        }
        const key = `${input.userId}:${input.counter}`;
        if (replayKeys.has(key)) {
          return false;
        }
        replayKeys.add(key);
        return true;
      },
    },
    repository,
  };

  return {
    dependencies,
    recoveryCodes,
    replayKeys,
    securityEvents,
    setReplayUnavailable(value: boolean) {
      replayUnavailable = value;
    },
    user,
  };
}

describe("two-factor service", () => {
  it("writes only ciphertext while a new setup is pending", async () => {
    const harness = createHarness();

    const setup = await startTwoFactorSetup(userId, harness.dependencies);

    assert.equal(setup.success, true);
    assert.equal(harness.user.twoFactorSecret, null);
    assert.equal(typeof harness.user.twoFactorSecretCiphertext, "string");
    assert.equal(harness.user.twoFactorSecretKeyVersion, "v1");
  });

  it("keeps setup pending until the first TOTP code is confirmed", async () => {
    const harness = createHarness();

    const setup = await startTwoFactorSetup(userId, harness.dependencies);

    assert.equal(setup.success, true);
    assert.equal(setup.manualEntryKey, rfc6238Secret);
    assert.equal(setup.qrCodeDataUrl.includes(setup.otpauthUri), true);
    assert.equal(harness.user.twoFactorEnabled, false);
    assert.equal(harness.user.twoFactorSecret, null);
    assert.equal(typeof harness.user.twoFactorSecretCiphertext, "string");
    assert.equal(harness.user.twoFactorSecretKeyVersion, "v1");
    assert.equal(resolveTotpSecret(harness.user, userId, keyring), rfc6238Secret);

    const wrongCode = await confirmTwoFactorSetup({ code: "000000", userId }, harness.dependencies);

    assert.deepEqual(wrongCode, {
      error: "invalid_code",
      success: false,
    });
    assert.equal(harness.user.twoFactorEnabled, false);
    assert.equal(harness.recoveryCodes.length, 0);

    const validCode = generateTotpCode(rfc6238Secret, { nowMs: 90_000 });
    const confirmed = await confirmTwoFactorSetup(
      { code: validCode, userId },
      harness.dependencies,
    );

    assert.equal(confirmed.success, true);
    assert.equal(confirmed.recoveryCodes.length, 10);
    assert.equal(harness.user.twoFactorEnabled, true);
    assert.equal(harness.recoveryCodes.length, 10);
    assert.equal(resolveTotpSecret(harness.user, userId, keyring), rfc6238Secret);

    const plaintextCodes = new Set(confirmed.recoveryCodes);
    for (const storedCode of harness.recoveryCodes) {
      assert.equal(plaintextCodes.has(storedCode.codeHash), false);
    }
  });

  it("confirms a legacy plaintext secret during dual-read migration", async () => {
    const harness = createHarness();
    harness.user.twoFactorSecret = rfc6238Secret;

    const result = await confirmTwoFactorSetup(
      {
        code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }),
        userId,
      },
      harness.dependencies,
    );

    assert.equal(result.success, true);
    assert.equal(harness.user.twoFactorSecret, null);
    assert.equal(typeof harness.user.twoFactorSecretCiphertext, "string");
    assert.equal(harness.user.twoFactorSecretKeyVersion, "v1");
  });

  it("never falls back to plaintext when encrypted secret authentication fails", async () => {
    const harness = createHarness();
    harness.user.twoFactorSecret = rfc6238Secret;
    harness.user.twoFactorSecretCiphertext = JSON.stringify({
      ciphertext: "AA",
      nonce: "AA",
      tag: "AA",
      v: 1,
    });
    harness.user.twoFactorSecretKeyVersion = "v1";

    await assert.rejects(
      () =>
        confirmTwoFactorSetup(
          {
            code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }),
            userId,
          },
          harness.dependencies,
        ),
      /TOTP secret decryption failed/u,
    );
    assert.equal(harness.user.twoFactorEnabled, false);
  });

  it("verifies TOTP or a one-time recovery code and locks repeated account failures", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;
    harness.recoveryCodes.push({
      codeHash: hashRecoveryCode("ABCDE-12345-FGHIJ-00"),
      id: "recovery-0",
      usedAt: null,
      userId,
    });

    const validTotp = generateTotpCode(rfc6238Secret, { nowMs: 90_000 });
    assert.deepEqual(
      await verifyTwoFactorCredential(
        { code: validTotp, secret: rfc6238Secret, userId },
        harness.dependencies,
      ),
      { success: true },
    );

    assert.deepEqual(
      await verifyTwoFactorCredential(
        { code: "ABCDE-12345-FGHIJ-00", secret: rfc6238Secret, userId },
        harness.dependencies,
      ),
      { success: true },
    );
    assert.notEqual(harness.recoveryCodes[0]?.usedAt, null);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verifyTwoFactorCredential(
        { code: "000000", secret: rfc6238Secret, userId },
        harness.dependencies,
      );
    }

    const locked = await verifyTwoFactorCredential(
      { code: validTotp, secret: rfc6238Secret, userId },
      harness.dependencies,
    );

    assert.equal(locked.success, false);
    assert.equal(locked.error, "rate_limited");
    assert.equal(typeof locked.retryAfterSeconds, "number");
  });

  it("accepts a TOTP time-step once and rejects replay", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;
    const code = generateTotpCode(rfc6238Secret, { nowMs: 90_000 });

    assert.deepEqual(
      await verifyTwoFactorCredential(
        { code, secret: rfc6238Secret, userId },
        harness.dependencies,
      ),
      { success: true },
    );
    assert.deepEqual(
      await verifyTwoFactorCredential(
        { code, secret: rfc6238Secret, userId },
        harness.dependencies,
      ),
      { error: "invalid_code", success: false },
    );
  });

  it("allows only one concurrent verification for one user and counter", async () => {
    const harness = createHarness();
    const code = generateTotpCode(rfc6238Secret, { nowMs: 90_000 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        verifyTwoFactorCredential({ code, secret: rfc6238Secret, userId }, harness.dependencies),
      ),
    );

    assert.equal(results.filter((result) => result.success).length, 1);
  });

  it("keeps adjacent counters and another user independent", async () => {
    const harness = createHarness();
    const previous = generateTotpCode(rfc6238Secret, { nowMs: 60_000 });
    const next = generateTotpCode(rfc6238Secret, { nowMs: 120_000 });
    const current = generateTotpCode(rfc6238Secret, { nowMs: 90_000 });

    assert.deepEqual(
      await verifyTwoFactorCredential(
        { code: previous, secret: rfc6238Secret, userId },
        harness.dependencies,
      ),
      { success: true },
    );
    assert.deepEqual(
      await verifyTwoFactorCredential(
        { code: next, secret: rfc6238Secret, userId },
        harness.dependencies,
      ),
      { success: true },
    );
    assert.deepEqual(
      await verifyTwoFactorCredential(
        { code: current, secret: rfc6238Secret, userId: "user-2" },
        harness.dependencies,
      ),
      { success: true },
    );
  });

  it("fails closed when replay storage is unavailable", async () => {
    const harness = createHarness();
    harness.setReplayUnavailable(true);

    assert.deepEqual(
      await verifyTwoFactorCredential(
        {
          code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }),
          secret: rfc6238Secret,
          userId,
        },
        harness.dependencies,
      ),
      { error: "verification_unavailable", success: false },
    );
  });

  it("preserves replay-store outages while disabling 2FA", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;
    harness.setReplayUnavailable(true);

    assert.deepEqual(
      await disableTwoFactor(
        {
          code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }),
          password: "correct-password",
          userId,
        },
        harness.dependencies,
      ),
      { error: "verification_unavailable", success: false },
    );
  });

  it("rejects an invalid password and invalid second factor identically", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;

    assert.deepEqual(
      await disableTwoFactor(
        { code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }), password: "wrong", userId },
        harness.dependencies,
      ),
      { error: "invalid_code", success: false },
    );

    assert.deepEqual(
      await disableTwoFactor(
        { code: "000000", password: "correct-password", userId },
        harness.dependencies,
      ),
      { error: "invalid_code", success: false },
    );
  });

  it("counts invalid passwords toward the two-factor attempt lock", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.deepEqual(
        await disableTwoFactor({ code: "000000", password: "wrong", userId }, harness.dependencies),
        { error: "invalid_code", success: false },
      );
    }

    assert.deepEqual(
      await disableTwoFactor({ code: "000000", password: "wrong", userId }, harness.dependencies),
      { error: "rate_limited", retryAfterSeconds: 30, success: false },
    );
  });

  it("requires a valid password and second factor before disabling 2FA", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;

    const disabled = await disableTwoFactor(
      {
        code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }),
        password: "correct-password",
        userId,
      },
      harness.dependencies,
    );

    assert.deepEqual(disabled, { success: true });
    assert.equal(harness.user.twoFactorEnabled, false);
    assert.equal(harness.user.twoFactorSecret, null);
    assert.equal(harness.user.twoFactorSecretCiphertext, null);
    assert.equal(harness.user.twoFactorSecretKeyVersion, null);
  });
  it("formats the manual entry key in groups of four", () => {
    assert.equal(formatManualEntryKey("K4XP9QF27MRT1DVB"), "K4XP 9QF2 7MRT 1DVB");
    assert.equal(formatManualEntryKey(rfc6238Secret), "GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ");
    assert.equal(formatManualEntryKey(""), "");
  });

  it("counts recovery codes as total and unused", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;
    harness.recoveryCodes.push(
      { codeHash: "a", id: "r0", usedAt: null, userId },
      { codeHash: "b", id: "r1", usedAt: new Date("2026-08-01T00:00:00.000Z"), userId },
      { codeHash: "c", id: "r2", usedAt: null, userId },
    );

    assert.deepEqual(await getRecoveryCodeStatus(userId, harness.dependencies), {
      success: true,
      total: 3,
      unused: 2,
    });
  });

  it("refuses to count recovery codes while two-factor is off", async () => {
    const harness = createHarness();

    assert.deepEqual(await getRecoveryCodeStatus(userId, harness.dependencies), {
      error: "not_enabled",
      success: false,
    });
  });

  it("regenerates recovery codes behind password plus TOTP and logs the event", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;
    harness.recoveryCodes.push({
      codeHash: hashRecoveryCode("OLD-CODE"),
      id: "r0",
      usedAt: null,
      userId,
    });

    const result = await regenerateRecoveryCodes(
      {
        code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }),
        password: "correct-password",
        userId,
      },
      harness.dependencies,
    );

    assert.equal(result.success, true);
    assert.equal(result.recoveryCodes.length, 10);
    assert.equal(harness.recoveryCodes.length, 10);
    // The old code is gone, not merely superseded.
    assert.equal(
      harness.recoveryCodes.some((entry) => entry.codeHash === hashRecoveryCode("OLD-CODE")),
      false,
    );
    assert.deepEqual(harness.securityEvents, [
      { kind: "RECOVERY_CODES_REGENERATED", metadata: { count: 10 }, userId },
    ]);
  });

  it("does not regenerate on a wrong password and logs nothing", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;
    harness.recoveryCodes.push({
      codeHash: hashRecoveryCode("OLD-CODE"),
      id: "r0",
      usedAt: null,
      userId,
    });

    const result = await regenerateRecoveryCodes(
      {
        code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }),
        password: "wrong-password",
        userId,
      },
      harness.dependencies,
    );

    assert.equal(result.success, false);
    assert.equal(harness.recoveryCodes.length, 1);
    assert.deepEqual(harness.securityEvents, []);
  });

  it("does not regenerate on a wrong second factor", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;

    const result = await regenerateRecoveryCodes(
      { code: "000000", password: "correct-password", userId },
      harness.dependencies,
    );

    assert.deepEqual(result, { error: "invalid_code", success: false });
    assert.deepEqual(harness.securityEvents, []);
  });
});
