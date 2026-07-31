import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encryptTotpSecret, parseTotpSecretKeyring } from "./totp-secret-encryption";
import { generateTotpCode } from "./totp";
import { createMemoryTwoFactorAttemptStore, type TwoFactorServiceDependencies } from "./two-factor";
import { verifyWebLoginTwoFactor } from "./web-login-two-factor";

const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const keyring = parseTotpSecretKeyring({
  TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: "v1",
  TOTP_SECRET_ENCRYPTION_KEYS: JSON.stringify({
    v1: Buffer.alloc(32, 0x73).toString("base64url"),
  }),
});

function dependencies(replayUnavailable = false): TwoFactorServiceDependencies {
  const consumed = new Set<string>();
  return {
    attemptStore: createMemoryTwoFactorAttemptStore(),
    keyring,
    nowMs: () => 90_000,
    replayStore: {
      async consume(input) {
        if (replayUnavailable) {
          throw new Error("Redis unavailable.");
        }
        const key = `${input.userId}:${input.counter}`;
        if (consumed.has(key)) {
          return false;
        }
        consumed.add(key);
        return true;
      },
    },
  };
}

function encryptedUser() {
  const encrypted = encryptTotpSecret({
    keyring,
    plaintext: secret,
    userId: "user-1",
  });
  return {
    id: "user-1",
    twoFactorEnabled: true,
    twoFactorSecret: "LEGACY-WRONG-SECRET",
    twoFactorSecretCiphertext: encrypted.ciphertext,
    twoFactorSecretKeyVersion: encrypted.keyVersion,
  };
}

describe("web password login two-factor gate", () => {
  it("keeps password-only login when two-factor is disabled", async () => {
    assert.equal(
      await verifyWebLoginTwoFactor(
        {
          id: "user-1",
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorSecretCiphertext: null,
          twoFactorSecretKeyVersion: null,
        },
        "",
        dependencies(true),
      ),
      true,
    );
  });

  it("uses encrypted secret and rejects replay", async () => {
    const deps = dependencies();
    const user = encryptedUser();
    const code = generateTotpCode(secret, { nowMs: 90_000 });

    assert.equal(await verifyWebLoginTwoFactor(user, code, deps), true);
    assert.equal(await verifyWebLoginTwoFactor(user, code, deps), false);
  });

  it("denies login when replay storage is unavailable", async () => {
    assert.equal(
      await verifyWebLoginTwoFactor(
        encryptedUser(),
        generateTotpCode(secret, { nowMs: 90_000 }),
        dependencies(true),
      ),
      false,
    );
  });
});
