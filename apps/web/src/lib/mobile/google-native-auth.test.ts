import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SignJWT, generateKeyPair, type JWTPayload } from "jose";

import {
  getMobileGoogleAudiences,
  MobileGoogleAuthError,
  readMobileGoogleIdentityClaims,
  verifyMobileGoogleIdToken,
} from "./google-native-auth";

const WEB_CLIENT_ID = "1234567890-whispr.apps.googleusercontent.com";

async function createSignedGoogleToken(
  claims: JWTPayload,
  overrides: { audience?: string; expiresIn?: string; issuer?: string } = {},
) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? "https://accounts.google.com")
    .setAudience(overrides.audience ?? WEB_CLIENT_ID)
    .setExpirationTime(overrides.expiresIn ?? "5m")
    .sign(privateKey);

  return { jwks: async () => publicKey, token };
}

describe("mobile Google identity claims", () => {
  it("keeps only the claims the session needs", () => {
    assert.deepEqual(
      readMobileGoogleIdentityClaims({
        email: "  Ada@Example.COM ",
        email_verified: true,
        name: " Ada Lovelace ",
        picture: "https://lh3.googleusercontent.com/ada",
        sub: "108124",
      }),
      {
        avatarUrl: "https://lh3.googleusercontent.com/ada",
        email: "ada@example.com",
        emailVerified: true,
        name: "Ada Lovelace",
        subject: "108124",
      },
    );
  });

  it("drops a non-HTTPS avatar instead of storing it", () => {
    const identity = readMobileGoogleIdentityClaims({
      email: "ada@example.com",
      email_verified: true,
      picture: "http://lh3.googleusercontent.com/ada",
      sub: "108124",
    });

    assert.equal(identity.avatarUrl, null);
    assert.equal(identity.name, null);
  });

  it("rejects an unverified Google email", () => {
    assert.throws(
      () =>
        readMobileGoogleIdentityClaims({
          email: "ada@example.com",
          email_verified: false,
          sub: "108124",
        }),
      (error: unknown) =>
        error instanceof MobileGoogleAuthError && error.code === "GOOGLE_EMAIL_UNVERIFIED",
    );
  });

  it("rejects tokens without a subject or email", () => {
    for (const claims of [
      { email: "ada@example.com", email_verified: true },
      { email_verified: true, sub: "108124" },
    ]) {
      assert.throws(
        () => readMobileGoogleIdentityClaims(claims),
        (error: unknown) =>
          error instanceof MobileGoogleAuthError && error.code === "GOOGLE_TOKEN_INVALID",
      );
    }
  });
});

describe("mobile Google ID token verification", () => {
  it("accepts a signed token issued by Google for this client", async () => {
    const { jwks, token } = await createSignedGoogleToken({
      email: "ada@example.com",
      email_verified: true,
      name: "Ada Lovelace",
      sub: "108124",
    });

    const identity = await verifyMobileGoogleIdToken(token, {
      audiences: [WEB_CLIENT_ID],
      jwks,
    });

    assert.equal(identity.subject, "108124");
    assert.equal(identity.email, "ada@example.com");
  });

  it("rejects tokens minted for a different client id", async () => {
    const { jwks, token } = await createSignedGoogleToken(
      { email: "ada@example.com", email_verified: true, sub: "108124" },
      { audience: "attacker.apps.googleusercontent.com" },
    );

    await assert.rejects(
      verifyMobileGoogleIdToken(token, { audiences: [WEB_CLIENT_ID], jwks }),
      (error: unknown) =>
        error instanceof MobileGoogleAuthError && error.code === "GOOGLE_TOKEN_INVALID",
    );
  });

  it("rejects tokens from another issuer or signed by another key", async () => {
    const wrongIssuer = await createSignedGoogleToken(
      { email: "ada@example.com", email_verified: true, sub: "108124" },
      { issuer: "https://accounts.evil.test" },
    );
    const foreignKey = await createSignedGoogleToken({
      email: "ada@example.com",
      email_verified: true,
      sub: "108124",
    });
    const googleKey = await createSignedGoogleToken({
      email: "ada@example.com",
      email_verified: true,
      sub: "108124",
    });

    await assert.rejects(
      verifyMobileGoogleIdToken(wrongIssuer.token, {
        audiences: [WEB_CLIENT_ID],
        jwks: wrongIssuer.jwks,
      }),
    );
    await assert.rejects(
      verifyMobileGoogleIdToken(foreignKey.token, {
        audiences: [WEB_CLIENT_ID],
        jwks: googleKey.jwks,
      }),
    );
  });

  it("rejects expired tokens", async () => {
    const { jwks, token } = await createSignedGoogleToken(
      { email: "ada@example.com", email_verified: true, sub: "108124" },
      { expiresIn: "-1m" },
    );

    await assert.rejects(verifyMobileGoogleIdToken(token, { audiences: [WEB_CLIENT_ID], jwks }));
  });

  it("refuses to run when no Google client id is configured", async () => {
    const { jwks, token } = await createSignedGoogleToken({
      email: "ada@example.com",
      email_verified: true,
      sub: "108124",
    });

    await assert.rejects(
      verifyMobileGoogleIdToken(token, { audiences: [], jwks }),
      (error: unknown) =>
        error instanceof MobileGoogleAuthError && error.code === "GOOGLE_NOT_CONFIGURED",
    );
  });

  it("collects configured audiences without duplicates or blanks", () => {
    assert.deepEqual(
      getMobileGoogleAudiences({
        AUTH_GOOGLE_ID: WEB_CLIENT_ID,
        GOOGLE_CLIENT_ID: WEB_CLIENT_ID,
        GOOGLE_MOBILE_CLIENT_ID: "  ",
      } as unknown as NodeJS.ProcessEnv),
      [WEB_CLIENT_ID],
    );
    assert.deepEqual(getMobileGoogleAudiences({} as unknown as NodeJS.ProcessEnv), []);
  });
});
