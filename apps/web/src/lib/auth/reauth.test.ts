import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAccountDeletionReauthToken,
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
});
