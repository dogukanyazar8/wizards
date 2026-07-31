import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mobileVerificationEmailRoute,
  type MobileVerificationEmailRouteDependencies,
} from "./route-logic";

describe("mobile verification-email route", () => {
  it("rate limits normalized recipient email before returning generic success", async () => {
    const calls: string[] = [];
    const dependencies: MobileVerificationEmailRouteDependencies = {
      enforceRateLimit: async (_request, subject) => {
        calls.push(`limit:${subject.namespace}:${subject.value}`);
      },
      parseRequest: async () => ({ email: "Ada@Example.COM", locale: "en" }),
      requestVerificationEmail: async () => {
        calls.push("send");
        return {
          email: "ada@example.com",
          message: "verification_email_if_available",
          status: "accepted",
        };
      },
    };

    const response = await mobileVerificationEmailRoute(
      new Request("http://localhost/api/v1/mobile/auth/verification-email", { method: "POST" }),
      dependencies,
    );

    assert.deepEqual(calls, ["limit:email:ada@example.com", "send"]);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
  });
});
