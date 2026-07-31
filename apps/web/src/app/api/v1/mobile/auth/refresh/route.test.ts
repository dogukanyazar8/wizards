import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileAuthRefreshRoute, type MobileAuthRefreshRouteDependencies } from "./route-logic";

describe("mobile auth refresh route", () => {
  it("rate limits an opaque refresh-token subject before rotation", async () => {
    const calls: string[] = [];
    const dependencies: MobileAuthRefreshRouteDependencies = {
      enforceRateLimit: async (_request, subject) => {
        assert.equal(subject.namespace, "refresh-token");
        assert.match(subject.value, /^[A-Za-z0-9_-]{43}$/);
        calls.push("limit");
      },
      parseRequest: async () => ({ refreshToken: "r".repeat(64) }),
      refreshSession: async () => {
        calls.push("refresh");
        return { session: { schemaVersion: 1 } } as never;
      },
    };

    const response = await mobileAuthRefreshRoute(
      new Request("http://localhost/api/v1/mobile/auth/refresh", { method: "POST" }),
      dependencies,
    );

    assert.deepEqual(calls, ["limit", "refresh"]);
    assert.equal(response.status, 200);
  });
});
