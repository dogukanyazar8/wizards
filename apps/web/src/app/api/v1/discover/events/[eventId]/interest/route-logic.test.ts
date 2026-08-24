import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import {
  discoverEventInterestRoute,
  type DiscoverEventInterestRouteDependencies,
} from "./route-logic";

function dependencies(
  overrides: Partial<DiscoverEventInterestRouteDependencies> = {},
): DiscoverEventInterestRouteDependencies {
  return {
    authenticate: async () => "viewer-1",
    enforceRateLimit: async () => undefined,
    setInterest: async (_userId, _eventId, interested) => ({
      interested,
      interestedCount: interested ? 1 : 0,
    }),
    ...overrides,
  };
}

function request(method: "DELETE" | "POST") {
  return new Request("https://whispr.test/api/v1/discover/events/event-1/interest", { method });
}

describe("POST/DELETE /api/v1/discover/events/[eventId]/interest", () => {
  it("keeps repeated POST idempotent, then DELETE returns zero", async () => {
    const interestedUserIds = new Set<string>();
    const deps = dependencies({
      setInterest: async (userId, _eventId, interested) => {
        if (interested) {
          interestedUserIds.add(userId);
        } else {
          interestedUserIds.delete(userId);
        }
        return { interested, interestedCount: interestedUserIds.size };
      },
    });

    const first = await discoverEventInterestRoute(request("POST"), "event-1", true, deps);
    const second = await discoverEventInterestRoute(request("POST"), "event-1", true, deps);
    const removed = await discoverEventInterestRoute(request("DELETE"), "event-1", false, deps);

    assert.deepEqual(await first.json(), { interested: true, interestedCount: 1 });
    assert.deepEqual(await second.json(), { interested: true, interestedCount: 1 });
    assert.deepEqual(await removed.json(), { interested: false, interestedCount: 0 });
  });

  it("preserves an unavailable event's 404", async () => {
    const response = await discoverEventInterestRoute(
      request("POST"),
      "missing",
      true,
      dependencies({
        setInterest: async () => {
          throw new ApiError("Event not found.", 404, "EVENT_NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Event not found.",
      code: "EVENT_NOT_FOUND",
    });
  });
});
