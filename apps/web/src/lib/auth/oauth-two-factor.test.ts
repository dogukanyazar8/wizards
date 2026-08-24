import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizeOAuthTwoFactorSignIn,
  completeOAuthTwoFactorChallenge,
  consumeOAuthTwoFactorGrant,
  createOAuthTwoFactorChallenge,
  getOAuthTwoFactorGrantCookieConfig,
  getOAuthTwoFactorPurpose,
  getSafeOAuthCallbackPath,
  hashOAuthTwoFactorToken,
  OAuthTwoFactorError,
} from "./oauth-two-factor";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const USER_ID = "user-1";
const PROVIDER_ACCOUNT_ID = "google-user-1";

function buildChallengeRecord() {
  return {
    expiresAt: new Date(NOW.getTime() + 60_000),
    id: "challenge-1",
    purpose: getOAuthTwoFactorPurpose("challenge", "google", PROVIDER_ACCOUNT_ID),
    usedAt: null,
    userId: USER_ID,
    user: {
      deletedAt: null,
      id: USER_ID,
      isBanned: false,
      twoFactorEnabled: true,
      twoFactorSecret: "legacy-secret",
      twoFactorSecretCiphertext: "encrypted-envelope",
      twoFactorSecretKeyVersion: "v1",
    },
  };
}

async function expectOAuthTwoFactorError(
  operation: () => Promise<unknown>,
  expected: { code: string; status: number },
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof OAuthTwoFactorError);
    assert.equal(error.code, expected.code);
    assert.equal(error.status, expected.status);
    return true;
  });
}

describe("OAuth two-factor challenge protocol", () => {
  it("redirects a protected OAuth identity until its exact one-time grant is consumed", async () => {
    const calls: string[] = [];
    const redirect = await authorizeOAuthTwoFactorSignIn(
      {
        existingUser: { id: USER_ID, twoFactorEnabled: true },
        grantToken: null,
        provider: "google",
        providerAccountId: PROVIDER_ACCOUNT_ID,
      },
      {
        consumeGrant: async () => {
          calls.push("consume-grant");
          return false;
        },
        createChallenge: async (input) => {
          calls.push("create-challenge");
          assert.deepEqual(input, {
            provider: "google",
            providerAccountId: PROVIDER_ACCOUNT_ID,
            userId: USER_ID,
          });
          return {
            expiresAt: new Date(NOW.getTime() + 300_000),
            token: "challenge-raw-token",
          };
        },
      },
    );

    assert.equal(redirect, "/oauth-two-factor?challenge=challenge-raw-token&provider=google");
    assert.deepEqual(calls, ["create-challenge"]);

    assert.equal(
      await authorizeOAuthTwoFactorSignIn(
        {
          existingUser: { id: USER_ID, twoFactorEnabled: true },
          grantToken: "grant-raw-token",
          provider: "google",
          providerAccountId: PROVIDER_ACCOUNT_ID,
        },
        {
          consumeGrant: async (input) => {
            assert.deepEqual(input, {
              grantToken: "grant-raw-token",
              provider: "google",
              providerAccountId: PROVIDER_ACCOUNT_ID,
              userId: USER_ID,
            });
            return true;
          },
          createChallenge: async () => assert.fail("A consumed grant must not create a challenge."),
        },
      ),
      true,
    );
  });

  it("leaves users without two-factor unchanged and rejects unsupported providers", async () => {
    assert.equal(
      await authorizeOAuthTwoFactorSignIn({
        existingUser: { id: USER_ID, twoFactorEnabled: false },
        grantToken: null,
        provider: "google",
        providerAccountId: PROVIDER_ACCOUNT_ID,
      }),
      true,
    );
    assert.equal(
      await authorizeOAuthTwoFactorSignIn({
        existingUser: { id: USER_ID, twoFactorEnabled: true },
        grantToken: null,
        provider: "unknown",
        providerAccountId: PROVIDER_ACCOUNT_ID,
      }),
      false,
    );
  });

  it("binds compact purposes to challenge kind, provider, and provider account", () => {
    const challenge = getOAuthTwoFactorPurpose("challenge", "google", PROVIDER_ACCOUNT_ID);
    const grant = getOAuthTwoFactorPurpose("grant", "google", PROVIDER_ACCOUNT_ID);

    assert.match(challenge, /^oauth2fa:c:google:[a-f0-9]{32}$/);
    assert.match(grant, /^oauth2fa:g:google:[a-f0-9]{32}$/);
    assert.notEqual(challenge, grant);
    assert.notEqual(
      challenge,
      getOAuthTwoFactorPurpose("challenge", "google", "another-google-user"),
    );
    assert.ok(challenge.length <= 64);
  });

  it("hashes raw tokens and scopes grant cookies to Auth.js callbacks", () => {
    assert.equal(hashOAuthTwoFactorToken("raw-token").length, 64);
    assert.notEqual(hashOAuthTwoFactorToken("raw-token"), hashOAuthTwoFactorToken("other-token"));
    assert.deepEqual(getOAuthTwoFactorGrantCookieConfig({ NODE_ENV: "production" }), {
      name: "__Secure-whispr.oauth-two-factor-grant",
      options: {
        httpOnly: true,
        maxAge: 300,
        path: "/api/auth/callback",
        sameSite: "lax",
        secure: true,
      },
    });
  });

  it("reduces Auth.js callback cookies to a sanitized local path", () => {
    assert.equal(
      getSafeOAuthCallbackPath(
        "https://whispr.team/desktop/oauth/complete?callbackUrl=%2Fchannels",
      ),
      "/desktop/oauth/complete?callbackUrl=%2Fchannels",
    );
    assert.equal(getSafeOAuthCallbackPath("https://evil.example/phish"), "/messages");
    assert.equal(getSafeOAuthCallbackPath("javascript:alert(1)"), "/messages");
  });

  it("creates a short-lived hashed challenge without storing the raw token", async () => {
    let created: unknown;
    const result = await createOAuthTwoFactorChallenge(
      { provider: "google", providerAccountId: PROVIDER_ACCOUNT_ID, userId: USER_ID },
      {
        createChallenge: async (input) => {
          created = input;
        },
        now: () => NOW,
        randomToken: () => "challenge-raw-token",
      },
    );

    assert.equal(result.token, "challenge-raw-token");
    assert.equal(result.expiresAt.toISOString(), "2026-08-12T12:05:00.000Z");
    assert.deepEqual(created, {
      expiresAt: result.expiresAt,
      purpose: getOAuthTwoFactorPurpose("challenge", "google", PROVIDER_ACCOUNT_ID),
      tokenHash: hashOAuthTwoFactorToken(result.token),
      userId: USER_ID,
    });
    assert.doesNotMatch(JSON.stringify(created), /challenge-raw-token/);
  });

  it("verifies TOTP before atomically replacing a challenge with a grant", async () => {
    const calls: string[] = [];
    let grantInput: unknown;
    const result = await completeOAuthTwoFactorChallenge(
      { challengeToken: "challenge-raw-token", twoFactorCode: "recovery-code" },
      {
        consumeChallengeAndCreateGrant: async (input) => {
          calls.push("consume-and-grant");
          grantInput = input;
          return true;
        },
        loadChallenge: async (tokenHash) => {
          assert.equal(tokenHash, hashOAuthTwoFactorToken("challenge-raw-token"));
          return buildChallengeRecord();
        },
        now: () => NOW,
        randomToken: () => "grant-raw-token",
        verifyTwoFactor: async (input) => {
          calls.push("verify-two-factor");
          assert.deepEqual(input, {
            code: "recovery-code",
            secret: "legacy-secret",
            secretCiphertext: "encrypted-envelope",
            secretKeyVersion: "v1",
            userId: USER_ID,
          });
          return { success: true };
        },
      },
    );

    assert.deepEqual(calls, ["verify-two-factor", "consume-and-grant"]);
    assert.equal(result.grantToken, "grant-raw-token");
    assert.equal(result.provider, "google");
    assert.deepEqual(grantInput, {
      challengeId: "challenge-1",
      grant: {
        expiresAt: new Date(NOW.getTime() + 5 * 60_000),
        purpose: getOAuthTwoFactorPurpose("grant", "google", PROVIDER_ACCOUNT_ID),
        tokenHash: hashOAuthTwoFactorToken("grant-raw-token"),
        userId: USER_ID,
      },
      now: NOW,
    });
  });

  it("does not consume the challenge when the two-factor credential is invalid", async () => {
    let consumeCalls = 0;
    await expectOAuthTwoFactorError(
      () =>
        completeOAuthTwoFactorChallenge(
          { challengeToken: "challenge-raw-token", twoFactorCode: "wrong-code" },
          {
            consumeChallengeAndCreateGrant: async () => {
              consumeCalls += 1;
              return true;
            },
            loadChallenge: async () => buildChallengeRecord(),
            now: () => NOW,
            randomToken: () => "grant-raw-token",
            verifyTwoFactor: async () => ({ error: "invalid_code", success: false }),
          },
        ),
      { code: "TWO_FACTOR_INVALID", status: 401 },
    );
    assert.equal(consumeCalls, 0);
  });

  it("consumes only a live grant bound to the exact user and provider identity", async () => {
    let consumed = 0;
    const grant = {
      expiresAt: new Date(NOW.getTime() + 60_000),
      id: "grant-1",
      purpose: getOAuthTwoFactorPurpose("grant", "google", PROVIDER_ACCOUNT_ID),
      usedAt: null,
      userId: USER_ID,
    };
    const options = {
      consumeGrant: async () => {
        consumed += 1;
        return true;
      },
      loadGrant: async () => grant,
      now: () => NOW,
    };

    assert.equal(
      await consumeOAuthTwoFactorGrant(
        {
          grantToken: "grant-raw-token",
          provider: "google",
          providerAccountId: PROVIDER_ACCOUNT_ID,
          userId: USER_ID,
        },
        options,
      ),
      true,
    );
    assert.equal(consumed, 1);
    assert.equal(
      await consumeOAuthTwoFactorGrant(
        {
          grantToken: "grant-raw-token",
          provider: "google",
          providerAccountId: "attacker-account",
          userId: USER_ID,
        },
        options,
      ),
      false,
    );
    assert.equal(consumed, 1);
  });
});
