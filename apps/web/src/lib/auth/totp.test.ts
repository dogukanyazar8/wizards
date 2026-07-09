import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTotpSetup,
  generateRecoveryCodes,
  generateTotpCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  verifyTotpCode,
  verifyTwoFactorLoginCode,
} from "./totp";

const rfc6238Secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP helpers", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    assert.equal(
      generateTotpCode(rfc6238Secret, {
        digits: 8,
        nowMs: 59_000,
      }),
      "94287082",
    );
  });

  it("verifies current and adjacent-window codes without accepting arbitrary values", () => {
    const code = generateTotpCode(rfc6238Secret, {
      nowMs: 90_000,
    });

    assert.equal(verifyTotpCode(rfc6238Secret, code, { nowMs: 90_000 }), true);
    assert.equal(verifyTotpCode(rfc6238Secret, code, { nowMs: 119_000 }), true);
    assert.equal(verifyTotpCode(rfc6238Secret, "000000", { nowMs: 90_000 }), false);
    assert.equal(verifyTotpCode(rfc6238Secret, "not-a-code", { nowMs: 90_000 }), false);
  });

  it("creates setup material with an otpauth URI and normalized manual key", () => {
    const setup = createTotpSetup({
      accountName: "Ada Lovelace",
      issuer: "Whispr",
      randomBytes: () => Buffer.from("12345678901234567890"),
    });

    assert.equal(setup.manualEntryKey, rfc6238Secret);
    assert.equal(
      setup.otpauthUri,
      "otpauth://totp/Whispr:Ada%20Lovelace?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Whispr&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("hashes recovery codes without storing plaintext values", () => {
    const codes = generateRecoveryCodes({
      count: 3,
      randomBytes: (size) => Buffer.alloc(size, 7),
    });

    assert.equal(codes.length, 3);
    assert.equal(new Set(codes.map((entry) => entry.plaintext)).size, 3);

    for (const entry of codes) {
      assert.notEqual(entry.hash, entry.plaintext);
      assert.equal(verifyRecoveryCode(entry.plaintext, entry.hash), true);
      assert.equal(verifyRecoveryCode(`${entry.plaintext}-wrong`, entry.hash), false);
      assert.equal(hashRecoveryCode(entry.plaintext), entry.hash);
    }
  });

  it("requires a valid TOTP code only when two-factor login is enabled", () => {
    const code = generateTotpCode(rfc6238Secret, { nowMs: 90_000 });

    assert.equal(
      verifyTwoFactorLoginCode({
        code: "",
        enabled: false,
        nowMs: 90_000,
        secret: null,
      }),
      true,
    );
    assert.equal(
      verifyTwoFactorLoginCode({
        code: "",
        enabled: true,
        nowMs: 90_000,
        secret: rfc6238Secret,
      }),
      false,
    );
    assert.equal(
      verifyTwoFactorLoginCode({
        code,
        enabled: true,
        nowMs: 90_000,
        secret: rfc6238Secret,
      }),
      true,
    );
    assert.equal(
      verifyTwoFactorLoginCode({
        code: "000000",
        enabled: true,
        nowMs: 90_000,
        secret: rfc6238Secret,
      }),
      false,
    );
  });
});
