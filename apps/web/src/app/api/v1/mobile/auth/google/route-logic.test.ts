import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileAuthGoogleLoginRequestSchema } from "@wizards/types";

import { parseJsonBody } from "@/lib/api";
import { MobileNativeAuthError } from "@/lib/mobile/auth";
import { mobileGoogleLoginRoute, type MobileGoogleLoginRouteDependencies } from "./route-logic";

const idToken = `${"a".repeat(40)}.${"b".repeat(40)}.${"c".repeat(40)}`;

const session = {
  lastValidatedAt: 1_700_000_000_000,
  schemaVersion: 1 as const,
  tokens: {
    accessToken: "a".repeat(24),
    expiresAt: 1_700_000_900_000,
    issuedAt: 1_700_000_000_000,
    refreshToken: "r".repeat(48) as string | null,
    scopes: ["mobile:bootstrap"],
    tokenType: "Bearer" as const,
  },
  user: {
    avatarUrl: null,
    displayName: "Ada",
    id: "11111111-1111-4111-8111-111111111111",
    username: "ada",
  },
};

function createDependencies(
  overrides: Partial<MobileGoogleLoginRouteDependencies> = {},
): MobileGoogleLoginRouteDependencies {
  return {
    createGoogleSession: async () => ({ session }),
    enforceRateLimit: async () => undefined,
    parseGoogleLoginRequest: async () => ({ idToken, locale: undefined }),
    ...overrides,
  };
}

function createRequest(body: unknown = { idToken }) {
  return new Request("http://localhost/api/v1/mobile/auth/google", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("mobile native Google login route", () => {
  it("rate limits the token fingerprint after parsing and before verification", async () => {
    const calls: string[] = [];
    const response = await mobileGoogleLoginRoute(
      createRequest(),
      createDependencies({
        createGoogleSession: async () => {
          calls.push("verify-and-mint");
          return { session };
        },
        enforceRateLimit: async (_request, subject) => {
          assert.equal(subject.namespace, "google-credential");
          assert.match(subject.value, /^[A-Za-z0-9_-]{43}$/);
          assert.notEqual(subject.value, idToken);
          calls.push("rate-limit");
        },
        parseGoogleLoginRequest: async () => {
          calls.push("parse-body");
          return { idToken, locale: undefined };
        },
      }),
    );

    assert.deepEqual(calls, ["parse-body", "rate-limit", "verify-and-mint"]);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), { session });
  });

  it("forwards the two-factor credential to the Google session boundary", async () => {
    let receivedInput: unknown;
    const response = await mobileGoogleLoginRoute(
      createRequest({ idToken, twoFactorCode: "123456" }),
      createDependencies({
        createGoogleSession: async (input) => {
          receivedInput = input;
          return { session };
        },
        parseGoogleLoginRequest: (request) =>
          parseJsonBody(request, MobileAuthGoogleLoginRequestSchema),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(receivedInput, { idToken, twoFactorCode: "123456" });
  });

  it("maps a rejected identity token to its native auth status code", async () => {
    const response = await mobileGoogleLoginRoute(
      createRequest(),
      createDependencies({
        createGoogleSession: async () => {
          throw new MobileNativeAuthError(
            "GOOGLE_TOKEN_INVALID",
            401,
            "The Google identity token could not be verified.",
          );
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.match(JSON.stringify(await response.json()), /GOOGLE_TOKEN_INVALID/);
  });

  it("rejects banned or deleted accounts with the mapped 403", async () => {
    const response = await mobileGoogleLoginRoute(
      createRequest(),
      createDependencies({
        createGoogleSession: async () => {
          throw new MobileNativeAuthError(
            "ACCOUNT_UNAVAILABLE",
            403,
            "This account cannot sign in right now.",
          );
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("refuses request bodies that are not a compact JWS", async () => {
    const response = await mobileGoogleLoginRoute(
      createRequest({ idToken: "not-a-token" }),
      createDependencies({
        parseGoogleLoginRequest: (request) =>
          parseJsonBody(request, MobileAuthGoogleLoginRequestSchema),
      }),
    );

    assert.equal(response.status, 400);
  });
});
