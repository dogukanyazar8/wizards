import assert from "node:assert/strict";
import { it } from "node:test";
import {
  credentialStamp,
  hashEmailChangeCode,
  canConfirmEmailChange,
  isEmailChangeGoogleCallback,
} from "./email-change-policy";

it("does not let a cancelled email reauth intercept normal Google login", () => {
  assert.equal(
    isEmailChangeGoogleCallback("https://whispr.team/settings/email-change/google"),
    true,
  );
  assert.equal(isEmailChangeGoogleCallback("/settings/email-change/google"), true);
  for (const url of [
    undefined,
    "/channels",
    "/settings",
    "https://whispr.team/desktop/oauth/complete",
    "https://[",
  ]) {
    assert.equal(isEmailChangeGoogleCallback(url), false);
  }
});

const user = {
  email: "old@example.com",
  passwordHash: "hash",
  sessionsRevokedAfter: null,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorSecretCiphertext: null,
};
it("binds code to the challenge and credential state", () => {
  const stamp = credentialStamp(user);
  assert.notEqual(stamp, credentialStamp({ ...user, passwordHash: "changed" }));
  assert.notEqual(stamp, credentialStamp({ ...user, email: "other@example.com" }));
  assert.notEqual(stamp, credentialStamp({ ...user, sessionsRevokedAfter: new Date() }));
  assert.notEqual(
    hashEmailChangeCode("123456", "a", "test-secret"),
    hashEmailChangeCode("123456", "b", "test-secret"),
  );
});
it("rejects expired, undelivered, exhausted and superseded challenges", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  const pending = {
    currentEmail: user.email,
    credentialStamp: credentialStamp(user),
    sentAt: now,
    expiresAt: new Date(now.getTime() + 1),
    attempts: 0,
  };
  assert.equal(canConfirmEmailChange(pending, user, now), true);
  for (const patch of [
    { expiresAt: now },
    { sentAt: null },
    { attempts: 5 },
    { currentEmail: "wrong@example.com" },
    { credentialStamp: "old" },
  ]) {
    assert.equal(canConfirmEmailChange({ ...pending, ...patch }, user, now), false);
  }
});
