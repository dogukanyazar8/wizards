import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileAuthExchangeRoute, type MobileAuthExchangeRouteDependencies } from "./route-logic";

describe("mobile auth exchange route", () => {
  it("rate limits an opaque handoff-token subject before exchange", async () => {
    const calls: string[] = [];
    const dependencies: MobileAuthExchangeRouteDependencies = {
      enforceRateLimit: async (_request, subject) => {
        assert.equal(subject.namespace, "handoff-token");
        assert.match(subject.value, /^[A-Za-z0-9_-]{43}$/);
        calls.push("limit");
      },
      exchangeToken: async () => {
        calls.push("exchange");
        return { session: { schemaVersion: 1 } } as never;
      },
      parseRequest: async () => ({
        callbackPath: "/messages",
        handoffToken: "h".repeat(48),
      }),
    };

    const response = await mobileAuthExchangeRoute(
      new Request("http://localhost/api/v1/mobile/auth/exchange", { method: "POST" }),
      dependencies,
    );

    assert.deepEqual(calls, ["limit", "exchange"]);
    assert.equal(response.status, 200);
  });
});
