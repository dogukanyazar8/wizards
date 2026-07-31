import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decryptTotpSecret,
  encryptTotpSecret,
  parseTotpSecretKeyring,
  resolveTotpSecret,
} from "./totp-secret-encryption";

const KEY_V1 = Buffer.alloc(32, 0x11).toString("base64url");
const KEY_V2 = Buffer.alloc(32, 0x22).toString("base64url");
const OTHER_KEY_V1 = Buffer.alloc(32, 0x33).toString("base64url");

function keyring(activeKeyVersion = "v1", keys: Record<string, string> = { v1: KEY_V1 }) {
  return parseTotpSecretKeyring({
    TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION: activeKeyVersion,
    TOTP_SECRET_ENCRYPTION_KEYS: JSON.stringify(keys),
  });
}

function mutateEnvelope(ciphertext: string, field: "ciphertext" | "nonce" | "tag") {
  const envelope = JSON.parse(ciphertext) as Record<string, string | number>;
  const value = String(envelope[field]);
  envelope[field] = `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
  return JSON.stringify(envelope);
}

describe("TOTP secret envelope encryption", () => {
  it("round-trips with a unique nonce per encryption", () => {
    const keys = keyring();
    const first = encryptTotpSecret({
      keyring: keys,
      plaintext: "JBSWY3DPEHPK3PXP",
      userId: "user-1",
    });
    const second = encryptTotpSecret({
      keyring: keys,
      plaintext: "JBSWY3DPEHPK3PXP",
      userId: "user-1",
    });

    assert.equal(first.keyVersion, "v1");
    assert.equal(
      decryptTotpSecret({
        ciphertext: first.ciphertext,
        keyVersion: first.keyVersion,
        keyring: keys,
        userId: "user-1",
      }),
      "JBSWY3DPEHPK3PXP",
    );
    assert.notEqual(
      (JSON.parse(first.ciphertext) as { nonce: string }).nonce,
      (JSON.parse(second.ciphertext) as { nonce: string }).nonce,
    );
    assert.notEqual(first.ciphertext, second.ciphertext);
  });

  it("rejects a wrong key without exposing crypto details", () => {
    const encrypted = encryptTotpSecret({
      keyring: keyring(),
      plaintext: "JBSWY3DPEHPK3PXP",
      userId: "user-1",
    });

    assert.throws(
      () =>
        decryptTotpSecret({
          ...encrypted,
          keyring: keyring("v1", { v1: OTHER_KEY_V1 }),
          userId: "user-1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "TOTP secret decryption failed.");
        assert.doesNotMatch(error.message, /JBSWY|cipher|nonce|tag|auth|key v1/iu);
        return true;
      },
    );
  });

  for (const field of ["ciphertext", "nonce", "tag"] as const) {
    it(`rejects a changed ${field}`, () => {
      const keys = keyring();
      const encrypted = encryptTotpSecret({
        keyring: keys,
        plaintext: "JBSWY3DPEHPK3PXP",
        userId: "user-1",
      });

      assert.throws(
        () =>
          decryptTotpSecret({
            ciphertext: mutateEnvelope(encrypted.ciphertext, field),
            keyVersion: encrypted.keyVersion,
            keyring: keys,
            userId: "user-1",
          }),
        /TOTP secret decryption failed/u,
      );
    });
  }

  it("binds userId and key version into AAD", () => {
    const keys = keyring("v1", { v1: KEY_V1, v2: KEY_V2 });
    const encrypted = encryptTotpSecret({
      keyring: keys,
      plaintext: "JBSWY3DPEHPK3PXP",
      userId: "user-1",
    });

    assert.throws(
      () => decryptTotpSecret({ ...encrypted, keyring: keys, userId: "user-2" }),
      /TOTP secret decryption failed/u,
    );
    assert.throws(
      () =>
        decryptTotpSecret({
          ciphertext: encrypted.ciphertext,
          keyVersion: "v2",
          keyring: keys,
          userId: "user-1",
        }),
      /TOTP secret decryption failed/u,
    );
  });

  it("rejects malformed envelopes with the same bounded error", () => {
    assert.throws(
      () =>
        decryptTotpSecret({
          ciphertext: '{"v":1,"ciphertext":"not-complete"}',
          keyVersion: "v1",
          keyring: keyring(),
          userId: "user-1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "TOTP secret decryption failed.");
        return true;
      },
    );
  });

  it("prefers ciphertext and falls back only when ciphertext is absent", () => {
    const keys = keyring();
    const encrypted = encryptTotpSecret({
      keyring: keys,
      plaintext: "ENCRYPTEDSECRET",
      userId: "user-1",
    });

    assert.equal(
      resolveTotpSecret(
        {
          twoFactorSecret: "PLAINTEXTSECRET",
          twoFactorSecretCiphertext: encrypted.ciphertext,
          twoFactorSecretKeyVersion: encrypted.keyVersion,
        },
        "user-1",
        keys,
      ),
      "ENCRYPTEDSECRET",
    );
    assert.equal(
      resolveTotpSecret(
        {
          twoFactorSecret: "PLAINTEXTSECRET",
          twoFactorSecretCiphertext: null,
          twoFactorSecretKeyVersion: null,
        },
        "user-1",
        keys,
      ),
      "PLAINTEXTSECRET",
    );
    assert.equal(
      resolveTotpSecret(
        {
          twoFactorSecret: null,
          twoFactorSecretCiphertext: null,
          twoFactorSecretKeyVersion: null,
        },
        "user-1",
        keys,
      ),
      null,
    );
    assert.throws(
      () =>
        resolveTotpSecret(
          {
            twoFactorSecret: "PLAINTEXTSECRET",
            twoFactorSecretCiphertext: mutateEnvelope(encrypted.ciphertext, "tag"),
            twoFactorSecretKeyVersion: encrypted.keyVersion,
          },
          "user-1",
          keys,
        ),
      /TOTP secret decryption failed/u,
    );
  });

  it("reads the previous version while new writes use the active version", () => {
    const oldKeyring = keyring("v1", { v1: KEY_V1 });
    const oldEncrypted = encryptTotpSecret({
      keyring: oldKeyring,
      plaintext: "ROTATESECRET",
      userId: "user-1",
    });
    const rotatingKeyring = keyring("v2", { v1: KEY_V1, v2: KEY_V2 });

    assert.equal(
      decryptTotpSecret({
        ...oldEncrypted,
        keyring: rotatingKeyring,
        userId: "user-1",
      }),
      "ROTATESECRET",
    );

    const rotated = encryptTotpSecret({
      keyring: rotatingKeyring,
      plaintext: "ROTATESECRET",
      userId: "user-1",
    });
    assert.equal(rotated.keyVersion, "v2");
  });
});
