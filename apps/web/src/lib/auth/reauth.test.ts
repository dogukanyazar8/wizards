import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAccountDeletionReauthToken,
  createAccountDeletionReauthTokenForVerifiedEmail,
  verifyAccountDeletionEmailReauthToken,
  verifyAccountDeletionReauthToken,
} from "./reauth";

const TEST_ENV = {
  AUTH_SECRET: "test-reauth-secret",
};
const NOW_MS = 1_700_000_000_000;

describe("account deletion re-auth tokens", () => {
  it("accepts a fresh token for the same user and password hash", () => {
    const { token } = createAccountDeletionReauthToken("user-1", "hash-1", {
      env: TEST_ENV,
      nowMs: NOW_MS,
    });

    assert.equal(
      verifyAccountDeletionReauthToken("user-1", "hash-1", token, {
        env: TEST_ENV,
        nowMs: NOW_MS + 60_000,
      }),
      true,
    );
  });

  it("rejects tokens for a different user", () => {
    const { token } = createAccountDeletionReauthToken("user-1", "hash-1", {
      env: TEST_ENV,
      nowMs: NOW_MS,
    });

    assert.equal(
      verifyAccountDeletionReauthToken("user-2", "hash-1", token, {
        env: TEST_ENV,
        nowMs: NOW_MS + 60_000,
      }),
      false,
    );
  });

  it("rejects tokens after a password hash change", () => {
    const { token } = createAccountDeletionReauthToken("user-1", "hash-1", {
      env: TEST_ENV,
      nowMs: NOW_MS,
    });

    assert.equal(
      verifyAccountDeletionReauthToken("user-1", "hash-2", token, {
        env: TEST_ENV,
        nowMs: NOW_MS + 60_000,
      }),
      false,
    );
  });

  it("rejects expired tokens", () => {
    const { token } = createAccountDeletionReauthToken("user-1", "hash-1", {
      env: TEST_ENV,
      nowMs: NOW_MS,
    });

    assert.equal(
      verifyAccountDeletionReauthToken("user-1", "hash-1", token, {
        env: TEST_ENV,
        nowMs: NOW_MS + 5 * 60_000 + 1,
      }),
      false,
    );
  });

  it("accepts verified-email tokens for OAuth-only accounts", () => {
    const verifiedAt = new Date("2026-05-16T12:00:00.000Z");
    const { token } = createAccountDeletionReauthTokenForVerifiedEmail(
      "user-1",
      "ada@example.com",
      verifiedAt,
      {
        env: TEST_ENV,
        nowMs: NOW_MS,
      },
    );

    assert.equal(
      verifyAccountDeletionEmailReauthToken("user-1", "ada@example.com", verifiedAt, token, {
        env: TEST_ENV,
        nowMs: NOW_MS + 60_000,
      }),
      true,
    );
  });

  it("rejects verified-email tokens after the bound email changes", () => {
    const verifiedAt = new Date("2026-05-16T12:00:00.000Z");
    const { token } = createAccountDeletionReauthTokenForVerifiedEmail(
      "user-1",
      "ada@example.com",
      verifiedAt,
      {
        env: TEST_ENV,
        nowMs: NOW_MS,
      },
    );

    assert.equal(
      verifyAccountDeletionEmailReauthToken("user-1", "grace@example.com", verifiedAt, token, {
        env: TEST_ENV,
        nowMs: NOW_MS + 60_000,
      }),
      false,
    );
  });

  it("fails closed when auth signing secrets conflict", () => {
    assert.throws(
      () =>
        createAccountDeletionReauthToken("user-1", "hash-1", {
          env: {
            AUTH_SECRET: "canonical-secret",
            NEXTAUTH_SECRET: "legacy-secret",
          },
          nowMs: NOW_MS,
        }),
      /AUTH_SECRET and NEXTAUTH_SECRET must match/,
    );
  });
});
