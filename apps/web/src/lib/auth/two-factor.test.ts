import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateTotpCode, hashRecoveryCode } from "./totp";
import {
  confirmTwoFactorSetup,
  createMemoryTwoFactorAttemptStore,
  disableTwoFactor,
  startTwoFactorSetup,
  verifyTwoFactorCredential,
  type TwoFactorRepository,
  type TwoFactorServiceDependencies,
} from "./two-factor";

const userId = "user-1";
const rfc6238Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

function createHarness() {
  const user = {
    email: "ada@example.test",
    id: userId,
    passwordHash: "correct-password",
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
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
    async disableTwoFactor(targetUserId) {
      assert.equal(targetUserId, userId);
      user.twoFactorEnabled = false;
      user.twoFactorSecret = null;
      recoveryCodes.length = 0;
    },
    async enableTwoFactor(targetUserId, secret, recoveryCodeHashes) {
      assert.equal(targetUserId, userId);
      user.twoFactorEnabled = true;
      user.twoFactorSecret = secret;
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
    async savePendingSecret(targetUserId, secret) {
      assert.equal(targetUserId, userId);
      user.twoFactorEnabled = false;
      user.twoFactorSecret = secret;
    },
  };

  const dependencies: TwoFactorServiceDependencies = {
    attemptStore: createMemoryTwoFactorAttemptStore(),
    comparePassword: async (password, passwordHash) => password === passwordHash,
    createQrCodeDataUrl: async (otpauthUri) => `data:image/svg+xml,${otpauthUri}`,
    nowMs: () => 90_000,
    randomBytes: () => Buffer.from("12345678901234567890"),
    repository,
  };

  return { dependencies, recoveryCodes, user };
}

describe("two-factor service", () => {
  it("keeps setup pending until the first TOTP code is confirmed", async () => {
    const harness = createHarness();

    const setup = await startTwoFactorSetup(userId, harness.dependencies);

    assert.equal(setup.success, true);
    assert.equal(setup.manualEntryKey, rfc6238Secret);
    assert.equal(setup.qrCodeDataUrl.includes(setup.otpauthUri), true);
    assert.equal(harness.user.twoFactorEnabled, false);
    assert.equal(harness.user.twoFactorSecret, rfc6238Secret);

    const wrongCode = await confirmTwoFactorSetup(
      { code: "000000", userId },
      harness.dependencies,
    );

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

    const plaintextCodes = new Set(confirmed.recoveryCodes);
    for (const storedCode of harness.recoveryCodes) {
      assert.equal(plaintextCodes.has(storedCode.codeHash), false);
    }
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

  it("requires a valid password and second factor before disabling 2FA", async () => {
    const harness = createHarness();
    harness.user.twoFactorEnabled = true;
    harness.user.twoFactorSecret = rfc6238Secret;

    assert.deepEqual(
      await disableTwoFactor(
        { code: generateTotpCode(rfc6238Secret, { nowMs: 90_000 }), password: "wrong", userId },
        harness.dependencies,
      ),
      { error: "invalid_credentials", success: false },
    );

    assert.deepEqual(
      await disableTwoFactor(
        { code: "000000", password: "correct-password", userId },
        harness.dependencies,
      ),
      { error: "invalid_code", success: false },
    );

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
  });
});
