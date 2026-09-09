import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { ApiRateLimitAction } from "@/lib/api-rate-limit";

import {
  messagingPrivacyReadRoute,
  messagingPrivacyUpdateRoute,
  mobileMessagingPrivacyDefaults,
  webMessagingPrivacyDefaults,
  type MessagingPrivacyRouteDependencies,
} from "./route-logic";

type Recorded = { limits: ApiRateLimitAction[]; writes: unknown[] };

function dependencies(overrides: Partial<MessagingPrivacyRouteDependencies> = {}): {
  dependencies: MessagingPrivacyRouteDependencies;
  recorded: Recorded;
} {
  const recorded: Recorded = { limits: [], writes: [] };

  return {
    recorded,
    dependencies: {
      authenticate: async () => "user-1",
      enforceRateLimit: async (_userId, action) => {
        recorded.limits.push(action);
      },
      rateLimits: { read: "user:privacy:read", update: "user:privacy:update" },
      read: async () => ({ readReceipts: true, typingIndicator: true }),
      update: async (_userId, input) => {
        recorded.writes.push(input);
        return { readReceipts: input.readReceipts ?? true, typingIndicator: true };
      },
      ...overrides,
    },
  };
}

function patch(body: unknown) {
  return new Request("https://whispr.test/api/v1/users/me/privacy", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

/** Mesajlar §15.5 madde 2 / karar K9. */
describe("messaging privacy route", () => {
  it("returns both switches and never caches them", async () => {
    const { dependencies: deps, recorded } = dependencies();

    const response = await messagingPrivacyReadRoute(
      new Request("https://whispr.test/api/v1/users/me/privacy"),
      deps,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { readReceipts: true, typingIndicator: true });
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    assert.deepEqual(recorded.limits, ["user:privacy:read"]);
  });

  it("writes only the switch the body named", async () => {
    const { dependencies: deps, recorded } = dependencies();

    const response = await messagingPrivacyUpdateRoute(patch({ readReceipts: false }), deps);

    assert.equal(response.status, 200);
    assert.deepEqual(recorded.writes, [{ readReceipts: false }]);
    assert.deepEqual(recorded.limits, ["user:privacy:update"]);
    // Both rows come back, so the card never has to guess what the other says.
    assert.deepEqual(await response.json(), { readReceipts: false, typingIndicator: true });
  });

  it("refuses a body that names no preference", async () => {
    const { dependencies: deps, recorded } = dependencies();

    const response = await messagingPrivacyUpdateRoute(patch({}), deps);

    assert.equal(response.status, 400);
    assert.deepEqual(recorded.writes, []);
  });

  // The card has exactly two rows; the third one is a transport fact with no
  // preference behind it (karar K2), so a body naming a third switch is a bug.
  it("refuses an unknown switch", async () => {
    const { dependencies: deps, recorded } = dependencies();

    const response = await messagingPrivacyUpdateRoute(patch({ encryption: false }), deps);

    assert.equal(response.status, 400);
    assert.deepEqual(recorded.writes, []);
  });

  it("does not rate-limit or write when authentication fails", async () => {
    const { dependencies: deps, recorded } = dependencies({
      authenticate: async () => {
        throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
      },
    });

    const response = await messagingPrivacyUpdateRoute(patch({ typingIndicator: false }), deps);

    assert.equal(response.status, 401);
    assert.deepEqual(recorded.limits, []);
    assert.deepEqual(recorded.writes, []);
  });

  // Karar K1. The phone changes the identity and the bucket and nothing else, so
  // a preference written from either end is the same column.
  it("shares everything but identity and bucket with the mobile twin", () => {
    assert.notEqual(
      mobileMessagingPrivacyDefaults.authenticate,
      webMessagingPrivacyDefaults.authenticate,
    );
    assert.deepEqual(mobileMessagingPrivacyDefaults.rateLimits, {
      read: "mobile:account:settings",
      update: "mobile:account:settings",
    });
    assert.equal(mobileMessagingPrivacyDefaults.read, webMessagingPrivacyDefaults.read);
    assert.equal(mobileMessagingPrivacyDefaults.update, webMessagingPrivacyDefaults.update);
  });
});
