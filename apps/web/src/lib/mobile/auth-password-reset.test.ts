import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { PASSWORD_RESET_TOKEN_EXPIRY_MINUTES } from "../auth/password-reset";
import {
  clearErrorReporter,
  registerErrorReporter,
} from "../observability/reporter";
import { requestMobilePasswordReset } from "./auth";

const resettableUser = {
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  id: "user-1",
  isBanned: false,
  locale: "tr",
  passwordHash: "stored-hash",
  username: "ada",
};

afterEach(() => {
  clearErrorReporter();
});

describe("mobile password reset", () => {
  it("returns the same positive reset-link TTL without revealing account existence", async () => {
    const sentEmails: string[] = [];
    const registered = await requestMobilePasswordReset(
      {
        email: " Ada@Example.COM ",
        locale: "tr",
      },
      {
        loadUserByEmail: async () => resettableUser,
        sendPasswordReset: async (user) => {
          sentEmails.push(user.email);
        },
      },
    );
    const unregistered = await requestMobilePasswordReset(
      {
        email: "missing@example.com",
        locale: "tr",
      },
      {
        loadUserByEmail: async () => null,
        sendPasswordReset: async () => {
          assert.fail("A missing account must not trigger a reset email.");
        },
      },
    );

    assert.equal(PASSWORD_RESET_TOKEN_EXPIRY_MINUTES > 0, true);
    assert.equal(registered.resetLinkTtlMinutes, PASSWORD_RESET_TOKEN_EXPIRY_MINUTES);
    assert.equal(unregistered.resetLinkTtlMinutes, PASSWORD_RESET_TOKEN_EXPIRY_MINUTES);
    assert.equal(registered.message, "password_reset_if_available");
    assert.equal(unregistered.message, "password_reset_if_available");
    assert.equal(registered.status, "accepted");
    assert.equal(unregistered.status, "accepted");
    assert.deepEqual(sentEmails, ["ada@example.com"]);
  });

  it("keeps the accepted response generic when reset delivery is unavailable", async () => {
    const response = await requestMobilePasswordReset(
      {
        email: "ada@example.com",
        locale: "tr",
      },
      {
        loadUserByEmail: async () => resettableUser,
        sendPasswordReset: async () => {
          throw new Error("reset provider unavailable");
        },
      },
    );

    assert.deepEqual(response, {
      email: "ada@example.com",
      message: "password_reset_if_available",
      resetLinkTtlMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
      status: "accepted",
    });
  });

  it("reports only a stable delivery category when a provider error contains a reset link", async () => {
    const reports: Array<{ error: unknown; scope: string }> = [];
    const resetLink =
      "https://whispr.test/reset-password?token=RESET_LINK_TOKEN_MUST_NOT_REACH_OBSERVABILITY";
    registerErrorReporter((scope, error) => {
      reports.push({ error, scope });
    });

    const response = await requestMobilePasswordReset(
      {
        email: "ada@example.com",
        locale: "tr",
      },
      {
        loadUserByEmail: async () => resettableUser,
        sendPasswordReset: async () => {
          throw new Error(`Provider rejected reset URL ${resetLink}`);
        },
      },
    );

    assert.deepEqual(response, {
      email: "ada@example.com",
      message: "password_reset_if_available",
      resetLinkTtlMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
      status: "accepted",
    });
    assert.deepEqual(reports, [
      {
        error: { code: "PASSWORD_RESET_DELIVERY_FAILED" },
        scope: "[mobile-auth] Password reset email failed",
      },
    ]);
  });
});
