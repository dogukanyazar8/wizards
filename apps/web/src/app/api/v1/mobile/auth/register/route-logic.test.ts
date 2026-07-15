import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileAuthRegisterRequestSchema } from "@wizards/types";

import { parseJsonBody } from "@/lib/api";
import {
  mobilePasswordRegisterRoute,
  type MobilePasswordRegisterRouteDependencies,
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
      username: "ada",
    }),
    registerPassword: async () => ({
      email: "ada@example.com",
      message: "verification_email_sent",
      status: "verification-required",
    }),
    ...overrides,
  };
}

describe("mobile password register route", () => {
  it("keeps IP limiting before registration without human verification", async () => {
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
      }),
    );

    assert.deepEqual(calls, ["ip-limit", "parse-body", "register-account"]);
    assert.equal(response.status, 200);
  });

  it("accepts a token-free request through strict input parsing", async () => {
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
      }),
    );

    assert.equal(response.status, 200);
  });

});
