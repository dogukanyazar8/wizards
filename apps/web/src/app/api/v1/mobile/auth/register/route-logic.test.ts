import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MobileAuthRegisterRequestSchema } from "@wizards/types";

import { parseJsonBody } from "@/lib/api";
import { MobileNativeAuthError } from "@/lib/mobile/auth";
import {
  mobilePasswordRegisterRoute,
  type MobilePasswordRegisterRouteDependencies,
} from "./route-logic";

function createDependencies(
  overrides: Partial<MobilePasswordRegisterRouteDependencies> = {},
): MobilePasswordRegisterRouteDependencies {
  return {
    enforceRateLimit: async () => undefined,
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
  it("rate limits the normalized email after parsing and before registration", async () => {
    const calls: string[] = [];
    const response = await mobilePasswordRegisterRoute(
      new Request("http://localhost/api/v1/mobile/auth/register", { method: "POST" }),
      createDependencies({
        enforceRateLimit: async (_request, subject) => {
          calls.push(`rate-limit:${subject.namespace}:${subject.value}`);
        },
        parseRegisterRequest: async () => {
          calls.push("parse-body");
          return {
            confirmPassword: "correct-password",
            email: "Ada@Example.COM",
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

    assert.deepEqual(calls, ["parse-body", "rate-limit:email:ada@example.com", "register-account"]);
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
        parseRegisterRequest: (request) => parseJsonBody(request, MobileAuthRegisterRequestSchema),
      }),
    );

    assert.equal(response.status, 200);
  });

  it("does not reveal an existing verified email through status or response shape", async () => {
    const request = new Request("http://localhost/api/v1/mobile/auth/register", {
      method: "POST",
    });
    const accepted = await mobilePasswordRegisterRoute(request, createDependencies());
    const existing = await mobilePasswordRegisterRoute(
      request,
      createDependencies({
        registerPassword: async () => {
          throw new MobileNativeAuthError(
            "EMAIL_TAKEN",
            409,
            "An account with this email already exists.",
          );
        },
      }),
    );

    assert.equal(existing.status, 200);
    assert.deepEqual(await existing.json(), await accepted.json());
  });
});
