import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileAuthPasswordLoginRequestSchema } from "@wizards/types";

import { parseJsonBody } from "@/lib/api";
import { MobileNativeAuthError } from "@/lib/mobile/auth";
import {
  mobilePasswordLoginRoute,
  type MobilePasswordLoginRouteDependencies,
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
    }),
    ...overrides,
  };
}

describe("mobile password login route", () => {
  it("keeps IP limiting before body parsing and account authentication without human verification", async () => {
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
          };
        },
      }),
    );

    assert.deepEqual(calls, ["ip-limit", "parse-body", "account-auth"]);
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

  it("accepts a token-free request through strict input parsing", async () => {
    const response = await mobilePasswordLoginRoute(
      new Request("http://localhost/api/v1/mobile/auth/login", {
        body: JSON.stringify({ email: "ada@example.com", password: "correct-password" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      createDependencies({
        parseLoginRequest: (request) =>
          parseJsonBody(request, MobileAuthPasswordLoginRequestSchema),
      }),
    );

    assert.equal(response.status, 401);
  });

});
