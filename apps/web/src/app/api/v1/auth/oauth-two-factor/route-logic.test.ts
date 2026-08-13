import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseJsonBody } from "@/lib/api";
import { hashOAuthTwoFactorToken, OAuthTwoFactorError } from "@/lib/auth/oauth-two-factor";
import {
  OAuthTwoFactorRequestSchema,
  getOAuthTwoFactorRateLimitIdentities,
  oauthTwoFactorRoute,
  type OAuthTwoFactorRouteDependencies,
} from "./route-logic";

process.env.TRUSTED_PROXY_HOPS = "1";

function createRequest(body: unknown) {
  return new Request("http://localhost/api/v1/auth/oauth-two-factor", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function createDependencies(
  overrides: Partial<OAuthTwoFactorRouteDependencies> = {},
): OAuthTwoFactorRouteDependencies {
  return {
    completeChallenge: async () => ({
      expiresAt: new Date("2026-08-12T12:05:00.000Z"),
      grantToken: "grant-raw-token",
      provider: "google",
    }),
    enforceRateLimit: async () => undefined,
    getGrantCookieConfig: () => ({
      name: "whispr.oauth-two-factor-grant",
      options: {
        httpOnly: true,
        maxAge: 300,
        path: "/api/auth/callback",
        sameSite: "lax",
        secure: false,
      },
    }),
    parseRequest: (request) => parseJsonBody(request, OAuthTwoFactorRequestSchema),
    ...overrides,
  };
}

describe("OAuth two-factor completion route", () => {
  it("keeps a stable trusted-network bucket when attackers rotate challenge tokens", () => {
    const first = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });
    const second = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });
    const firstKeys = getOAuthTwoFactorRateLimitIdentities(first, "challenge-a");
    const secondKeys = getOAuthTwoFactorRateLimitIdentities(second, "challenge-b");

    assert.equal(firstKeys[0], secondKeys[0]);
    assert.notEqual(firstKeys[1], secondKeys[1]);
  });

  it("rate limits the challenge fingerprint, completes it, and writes only an HttpOnly grant", async () => {
    const calls: string[] = [];
    const response = await oauthTwoFactorRoute(
      createRequest({ challengeToken: "challenge-raw-token", twoFactorCode: "123456" }),
      createDependencies({
        completeChallenge: async (input) => {
          calls.push("complete");
          assert.deepEqual(input, {
            challengeToken: "challenge-raw-token",
            twoFactorCode: "123456",
          });
          return {
            expiresAt: new Date("2026-08-12T12:05:00.000Z"),
            grantToken: "grant-raw-token",
            provider: "google",
          };
        },
        enforceRateLimit: async (request, identifier) => {
          calls.push("rate-limit");
          assert.equal(new URL(request.url).pathname, "/api/v1/auth/oauth-two-factor");
          assert.equal(identifier, hashOAuthTwoFactorToken("challenge-raw-token"));
          assert.notEqual(identifier, "challenge-raw-token");
        },
        parseRequest: async (request) => {
          calls.push("parse");
          return parseJsonBody(request, OAuthTwoFactorRequestSchema);
        },
      }),
    );

    assert.deepEqual(calls, ["parse", "rate-limit", "complete"]);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { provider: "google", success: true });
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /^whispr\.oauth-two-factor-grant=grant-raw-token;/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Path=\/api\/auth\/callback/i);
    assert.match(setCookie, /SameSite=lax/i);
  });

  it("maps invalid two-factor credentials without setting a grant cookie", async () => {
    const response = await oauthTwoFactorRoute(
      createRequest({ challengeToken: "challenge-raw-token", twoFactorCode: "wrong-code" }),
      createDependencies({
        completeChallenge: async () => {
          throw new OAuthTwoFactorError(
            "TWO_FACTOR_INVALID",
            401,
            "The two-factor code is invalid or expired.",
          );
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), {
      code: "TWO_FACTOR_INVALID",
      error: "The two-factor code is invalid or expired.",
    });
  });

  it("rejects blank and oversized credentials at the request boundary", async () => {
    for (const twoFactorCode of ["   ", "x".repeat(65)]) {
      const response = await oauthTwoFactorRoute(
        createRequest({ challengeToken: "challenge-raw-token", twoFactorCode }),
        createDependencies(),
      );
      assert.equal(response.status, 400);
    }
  });
});
