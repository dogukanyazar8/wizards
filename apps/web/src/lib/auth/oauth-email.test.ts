import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canOAuthUserSignIn,
  canOAuthIdentityUseTwoFactorStepUp,
  findVerifiedPrimaryGitHubEmail,
  isGitHubOAuthEmailVerified,
  resolveOAuthPolicyUser,
} from "./oauth-email";

describe("OAuth email verification", () => {
  it("steps up linked GitHub identities without enabling GitHub email auto-linking", () => {
    assert.equal(canOAuthIdentityUseTwoFactorStepUp("github", true), true);
    assert.equal(canOAuthIdentityUseTwoFactorStepUp("github", false), false);
    assert.equal(canOAuthIdentityUseTwoFactorStepUp("google", false), true);
  });

  it("uses the linked provider account before a conflicting profile email", async () => {
    const linkedUser = { id: "linked", twoFactorEnabled: true };
    const emailUser = { id: "email-owner", twoFactorEnabled: false };
    const calls: string[] = [];

    assert.deepEqual(
      await resolveOAuthPolicyUser({
        account: { provider: "google", providerAccountId: "google-123" },
        email: "email-owner@example.com",
        findByAccount: async () => {
          calls.push("account");
          return linkedUser;
        },
        findByEmail: async () => {
          calls.push("email");
          return emailUser;
        },
      }),
      { linked: true, user: linkedUser },
    );
    assert.deepEqual(calls, ["account"]);
  });

  it("falls back to email only when the provider account is not linked", async () => {
    const emailUser = { id: "email-owner", twoFactorEnabled: true };
    const calls: string[] = [];

    assert.deepEqual(
      await resolveOAuthPolicyUser({
        account: { provider: "google", providerAccountId: "google-123" },
        email: "email-owner@example.com",
        findByAccount: async () => {
          calls.push("account");
          return null;
        },
        findByEmail: async () => {
          calls.push("email");
          return emailUser;
        },
      }),
      { linked: false, user: emailUser },
    );
    assert.deepEqual(calls, ["account", "email"]);
  });

  it("requires GitHub primary email to be verified and match the claimed profile email", async () => {
    assert.equal(
      await isGitHubOAuthEmailVerified({
        account: { access_token: "token", provider: "github" },
        fetchGitHubEmail: async () => "ada@example.com",
        profile: { email: "ada@example.com" },
        user: { email: "ada@example.com" },
      }),
      true,
    );

    assert.equal(
      await isGitHubOAuthEmailVerified({
        account: { access_token: "token", provider: "github" },
        fetchGitHubEmail: async () => "other@example.com",
        profile: { email: "ada@example.com" },
        user: { email: "ada@example.com" },
      }),
      false,
    );
  });

  it("fails GitHub sign-in closed when the access token or verified primary email is missing", async () => {
    assert.equal(
      await canOAuthUserSignIn({
        account: { provider: "github" },
        profile: { email: "ada@example.com" },
        user: { email: "ada@example.com" },
      }),
      false,
    );

    assert.equal(
      await canOAuthUserSignIn({
        account: { access_token: "token", provider: "github" },
        fetchGitHubEmail: async () => null,
        profile: { email: "ada@example.com" },
        user: { email: "ada@example.com" },
      }),
      false,
    );
  });

  it("extracts only verified primary GitHub emails", () => {
    assert.equal(
      findVerifiedPrimaryGitHubEmail([
        { email: "secondary@example.com", primary: false, verified: true },
        { email: "primary@example.com", primary: true, verified: false },
      ]),
      null,
    );
    assert.equal(
      findVerifiedPrimaryGitHubEmail([
        { email: "primary@example.com", primary: true, verified: true },
      ]),
      "primary@example.com",
    );
  });

  it("keeps Google sign-in tied to the provider email_verified claim", async () => {
    assert.equal(
      await canOAuthUserSignIn({
        account: { provider: "google" },
        profile: { email: "ada@example.com", email_verified: true },
        user: { email: "ada@example.com" },
      }),
      true,
    );
    assert.equal(
      await canOAuthUserSignIn({
        account: { provider: "google" },
        profile: { email: "ada@example.com" },
        user: { email: "ada@example.com" },
      }),
      false,
    );
  });

  it("blocks verified Google sign-in when the existing account requires local two-factor", async () => {
    const input = {
      account: { provider: "google" },
      profile: { email: "ada@example.com", email_verified: true },
      user: { email: "ada@example.com" },
    };

    assert.equal(
      await canOAuthUserSignIn({
        ...input,
        existingUser: { twoFactorEnabled: true },
        twoFactorVerified: true,
      }),
      true,
    );
    assert.equal(
      await canOAuthUserSignIn({
        ...input,
        existingUser: { twoFactorEnabled: true },
      }),
      false,
    );
    assert.equal(
      await canOAuthUserSignIn({
        ...input,
        existingUser: { twoFactorEnabled: false },
      }),
      true,
    );
    assert.equal(await canOAuthUserSignIn(input), true);
  });
});
