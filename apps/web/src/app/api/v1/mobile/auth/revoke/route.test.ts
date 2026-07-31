import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileAuthRevokeRoute, type MobileAuthRevokeRouteDependencies } from "./route-logic";

describe("mobile auth revoke route", () => {
  it("rate limits an opaque refresh-token subject before revocation", async () => {
    const calls: string[] = [];
    const dependencies: MobileAuthRevokeRouteDependencies = {
      enforceRateLimit: async (_request, subject) => {
        assert.equal(subject.namespace, "refresh-token");
        assert.match(subject.value, /^[A-Za-z0-9_-]{43}$/);
        calls.push("limit");
      },
      getAccessToken: () => null,
      parseRequest: async () => ({ refreshToken: "r".repeat(64) }),
      revokeSession: async () => {
        calls.push("revoke");
      },
      verifyAccessToken: () => null,
    };

    const response = await mobileAuthRevokeRoute(
      new Request("http://localhost/api/v1/mobile/auth/revoke", { method: "POST" }),
      dependencies,
    );

    assert.deepEqual(calls, ["limit", "revoke"]);
    assert.equal(response.status, 204);
  });
});
