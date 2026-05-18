import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canOAuthUserSignIn,
  findVerifiedPrimaryGitHubEmail,
  isGitHubOAuthEmailVerified,
} from "./oauth-email";

describe("OAuth email verification", () => {
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
});
