import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileAuthRegisterRequestSchema } from "@wizards/types";

import { parseJsonBody } from "@/lib/api";
import { TurnstileVerificationError } from "@/lib/auth/turnstile";
import {
  mobilePasswordRegisterRoute,
  type MobilePasswordRegisterRouteDependencies,
  verifyMobilePasswordRegisterTurnstile,
} from "./route-logic";

function createDependencies(
  overrides: Partial<MobilePasswordRegisterRouteDependencies> = {},
): MobilePasswordRegisterRouteDependencies {
  return {
    enforceIpRateLimit: async () => undefined,
    parseRegisterRequest: async () => ({
      confirmPassword: "correct-password",
      email: "ada@example.com",
      password: "correct-password",
      turnstileToken: "test-turnstile-token",
      username: "ada",
    }),
    registerPassword: async () => ({
      email: "ada@example.com",
      message: "verification_email_sent",
      status: "verification-required",
    }),
    verifyTurnstile: async () => undefined,
    ...overrides,
  };
}

describe("mobile password register route", () => {
  it("keeps IP limiting and Turnstile verification before registration", async () => {
    const calls: string[] = [];
    const response = await mobilePasswordRegisterRoute(
      new Request("http://localhost/api/v1/mobile/auth/register", { method: "POST" }),
      createDependencies({
        enforceIpRateLimit: async () => {
          calls.push("ip-limit");
        },
        parseRegisterRequest: async () => {
          calls.push("parse-body");
          return {
            confirmPassword: "correct-password",
            email: "ada@example.com",
            password: "correct-password",
            turnstileToken: "test-turnstile-token",
            username: "ada",
          };
        },
        registerPassword: async () => {
          calls.push("register-account");
          return {
            email: "ada@example.com",
            message: "verification_email_sent",
            status: "verification-required",
          };
        },
        verifyTurnstile: async () => {
          calls.push("turnstile");
        },
      }),
    );

    assert.deepEqual(calls, ["ip-limit", "parse-body", "turnstile", "register-account"]);
    assert.equal(response.status, 200);
  });

  it("rejects a failed Turnstile verification before registration", async () => {
    let registrationCalled = false;
    const response = await mobilePasswordRegisterRoute(
      new Request("http://localhost/api/v1/mobile/auth/register", { method: "POST" }),
      createDependencies({
        registerPassword: async () => {
          registrationCalled = true;
          return {
            email: "ada@example.com",
            message: "verification_email_sent",
            status: "verification-required",
          };
        },
        verifyTurnstile: async () => {
          throw new TurnstileVerificationError("INVALID_TOKEN", "Provider-specific detail");
        },
      }),
    );

    assert.equal(registrationCalled, false);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "TURNSTILE_FAILED",
      error: "Human verification failed.",
    });
  });

  it("rejects a missing Turnstile token during strict input parsing", async () => {
    let turnstileCalled = false;
    const response = await mobilePasswordRegisterRoute(
      new Request("http://localhost/api/v1/mobile/auth/register", {
        body: JSON.stringify({
          confirmPassword: "correct-password",
          email: "ada@example.com",
          password: "correct-password",
          username: "ada",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      createDependencies({
        parseRegisterRequest: (request) =>
          parseJsonBody(request, MobileAuthRegisterRequestSchema),
        verifyTurnstile: async () => {
          turnstileCalled = true;
        },
      }),
    );

    assert.equal(turnstileCalled, false);
    assert.equal(response.status, 400);
  });

  it("uses the register action and client IP for the default Turnstile verifier", async () => {
    const originalFetch = globalThis.fetch;
    const originalSecret = process.env.TURNSTILE_SECRET_KEY;
    const originalE2eMode = process.env.E2E_TEST_MODE;
    let requestBody: URLSearchParams | undefined;

    process.env.E2E_TEST_MODE = "false";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-test-secret";
    globalThis.fetch = async (_input, init) => {
      requestBody = init?.body as URLSearchParams;
      return new Response(JSON.stringify({ action: "register", success: true }), {
        headers: { "content-type": "application/json" },
      });
    };

    try {
      await verifyMobilePasswordRegisterTurnstile(
        new Request("http://localhost/api/v1/mobile/auth/register", {
          headers: { "x-real-ip": "198.51.100.8" },
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
    assert.equal(requestBody.get("remoteip"), "198.51.100.8");
  });
});
