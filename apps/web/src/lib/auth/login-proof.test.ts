import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLoginProof, verifyLoginProof } from "./login-proof";

const env = { AUTH_SECRET: "test-secret" };

describe("login proof", () => {
  it("accepts a fresh proof for the same normalized email", () => {
    const proof = createLoginProof("Ada@Example.test", {
      env,
      nowMs: 1_000_000,
    });

    assert.equal(
      verifyLoginProof("ada@example.test", proof, {
        env,
        nowMs: 1_000_500,
      }),
      true,
    );
  });

  it("rejects missing, expired, or email-mismatched proofs", () => {
    const proof = createLoginProof("ada@example.test", {
      env,
      nowMs: 1_000_000,
    });

    assert.equal(verifyLoginProof("ada@example.test", "", { env, nowMs: 1_000_500 }), false);
    assert.equal(
      verifyLoginProof("grace@example.test", proof, {
        env,
        nowMs: 1_000_500,
      }),
      false,
    );
    assert.equal(
      verifyLoginProof("ada@example.test", proof, {
        env,
        nowMs: 1_000_000 + 2 * 60 * 1000 + 1,
      }),
      false,
    );
  });
});
