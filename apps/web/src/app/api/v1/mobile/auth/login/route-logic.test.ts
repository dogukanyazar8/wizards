import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileAuthPasswordLoginRequestSchema } from "@wizards/types";

import { parseJsonBody } from "@/lib/api";
import { TurnstileVerificationError } from "@/lib/auth/turnstile";
import { MobileNativeAuthError } from "@/lib/mobile/auth";
import {
  mobilePasswordLoginRoute,
  type MobilePasswordLoginRouteDependencies,
  verifyMobilePasswordLoginTurnstile,
} from "./route-logic";

function createDependencies(
  overrides: Partial<MobilePasswordLoginRouteDependencies> = {},
): MobilePasswordLoginRouteDependencies {
  return {
    createPasswordSession: async () => null,
    enforceIpRateLimit: async () => undefined,
    parseLoginRequest: async () => ({
      email: "ada@example.com",
      password: "wrong-password",
      turnstileToken: "test-turnstile-token",
    }),
    verifyTurnstile: async () => undefined,
    ...overrides,
  };
}

describe("mobile password login route", () => {
  it("keeps IP limiting before body parsing and account authentication", async () => {
    const calls: string[] = [];
    const response = await mobilePasswordLoginRoute(
      new Request("http://localhost/api/v1/mobile/auth/login", {
        body: JSON.stringify({ email: "ada@example.com", password: "wrong-password" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      createDependencies({
        createPasswordSession: async () => {
          calls.push("account-auth");
          return null;
        },
        enforceIpRateLimit: async () => {
          calls.push("ip-limit");
        },
        parseLoginRequest: async () => {
          calls.push("parse-body");
          return {
            email: "ada@example.com",
            password: "wrong-password",
            turnstileToken: "test-turnstile-token",
          };
        },
        verifyTurnstile: async () => {
          calls.push("turnstile");
        },
      }),
    );

    assert.deepEqual(calls, ["ip-limit", "parse-body", "turnstile", "account-auth"]);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "INVALID_CREDENTIALS",
      error: "Invalid email or password.",
    });
  });

  it("returns a generic account lock response without credential details", async () => {
    const response = await mobilePasswordLoginRoute(
      new Request("http://localhost/api/v1/mobile/auth/login", { method: "POST" }),
      createDependencies({
        createPasswordSession: async () => {
          throw new MobileNativeAuthError(
            "RATE_LIMITED",
            429,
            "Too many sign-in attempts. Please try again shortly.",
          );
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      code: "RATE_LIMITED",
      error: "Too many sign-in attempts. Please try again shortly.",
    });
  });

  it("rejects a failed Turnstile verification before account authentication", async () => {
    let accountAuthenticationCalled = false;
    const response = await mobilePasswordLoginRoute(
      new Request("http://localhost/api/v1/mobile/auth/login", { method: "POST" }),
      createDependencies({
        createPasswordSession: async () => {
          accountAuthenticationCalled = true;
          return null;
        },
        verifyTurnstile: async () => {
          throw new TurnstileVerificationError("INVALID_TOKEN", "Provider-specific detail");
        },
      }),
    );

    assert.equal(accountAuthenticationCalled, false);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "TURNSTILE_FAILED",
      error: "Human verification failed.",
    });
  });

  it("rejects a missing Turnstile token during strict input parsing", async () => {
    let turnstileCalled = false;
    const response = await mobilePasswordLoginRoute(
      new Request("http://localhost/api/v1/mobile/auth/login", {
        body: JSON.stringify({ email: "ada@example.com", password: "correct-password" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      createDependencies({
        parseLoginRequest: (request) =>
          parseJsonBody(request, MobileAuthPasswordLoginRequestSchema),
        verifyTurnstile: async () => {
          turnstileCalled = true;
        },
      }),
    );

    assert.equal(turnstileCalled, false);
    assert.equal(response.status, 400);
  });

  it("uses the login action and client IP for the default Turnstile verifier", async () => {
    const originalFetch = globalThis.fetch;
    const originalSecret = process.env.TURNSTILE_SECRET_KEY;
    const originalE2eMode = process.env.E2E_TEST_MODE;
    let requestBody: URLSearchParams | undefined;

    process.env.E2E_TEST_MODE = "false";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-test-secret";
    globalThis.fetch = async (_input, init) => {
      requestBody = init?.body as URLSearchParams;
      return new Response(JSON.stringify({ action: "login", success: true }), {
        headers: { "content-type": "application/json" },
      });
    };

    try {
      await verifyMobilePasswordLoginTurnstile(
        new Request("http://localhost/api/v1/mobile/auth/login", {
          headers: { "x-forwarded-for": "203.0.113.4, 198.51.100.2" },
        }),
        "verified-token",
      );
    } finally {
      globalThis.fetch = originalFetch;
      if (originalSecret === undefined) {
        delete process.env.TURNSTILE_SECRET_KEY;
      } else {
        process.env.TURNSTILE_SECRET_KEY = originalSecret;
      }
      if (originalE2eMode === undefined) {
        delete process.env.E2E_TEST_MODE;
      } else {
        process.env.E2E_TEST_MODE = originalE2eMode;
      }
    }

    assert.ok(requestBody instanceof URLSearchParams);
    assert.equal(requestBody.get("remoteip"), "203.0.113.4");
  });
});
