import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mobileForgotPasswordRoute,
  type MobileForgotPasswordRouteDependencies,
} from "./route-logic";

describe("mobile forgot-password route", () => {
  it("rate limits normalized email before sending a generic success response", async () => {
    const calls: string[] = [];
    const dependencies: MobileForgotPasswordRouteDependencies = {
      enforceRateLimit: async (_request, subject) => {
        calls.push(`limit:${subject.namespace}:${subject.value}`);
      },
      parseRequest: async () => ({ email: "Ada@Example.COM", locale: "tr" }),
      requestPasswordReset: async () => {
        calls.push("send");
        return {
          email: "ada@example.com",
          message: "password_reset_if_available",
          resetLinkTtlMinutes: 30,
          status: "accepted",
        };
      },
    };

    const response = await mobileForgotPasswordRoute(
      new Request("http://localhost/api/v1/mobile/auth/forgot-password", { method: "POST" }),
      dependencies,
    );

    assert.deepEqual(calls, ["limit:email:ada@example.com", "send"]);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
  });
});
