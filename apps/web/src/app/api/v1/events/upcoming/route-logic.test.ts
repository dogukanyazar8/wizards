import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { getHomeUpcomingEvents } from "@/lib/home/events-service";
import {
  UNAUTHENTICATED,
  createFakeDatabase,
  fakePresenceReader,
  readJson,
  recordRateLimit,
} from "@/lib/home/home-test-doubles";
import { toRelativeAppHref } from "@/lib/home/href";
import { EventsUpcomingResponseSchema } from "@/lib/home/types";

import { eventsUpcomingRoute, type EventsUpcomingRouteDependencies } from "./route-logic";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function eventRow(id: string, startAt: string, overrides: Record<string, unknown> = {}) {
  return {
    channel: { id: "c-voice", name: "Sahne" },
    id,
    interestedCount: 12,
    interests: [{ id: "int-1" }],
    name: `Etkinlik ${id}`,
    scheduledStartAt: new Date(startAt),
    server: { id: "s1", name: "Whispr" },
    serverId: "s1",
    ...overrides,
  };
}

function eventsDatabase(
  overrides: { memberships?: readonly unknown[]; rows?: readonly unknown[] } = {},
) {
  return createFakeDatabase({
    models: {
      scheduledEvent: {
        count: () => 6,
        findMany: () =>
          overrides.rows ?? [
            eventRow("ev-1", "2026-08-19T10:00:00.000Z"),
            eventRow("ev-2", "2026-08-20T10:00:00.000Z"),
          ],
      },
      scheduledEventInterest: {
        findMany: () => [
          { user: { avatarUrl: null, displayName: "Ayşe", id: "u2", username: "ayse" } },
        ],
      },
      serverMember: { findMany: () => overrides.memberships ?? [{ serverId: "s1" }] },
    },
  });
}

function routeDependencies(
  overrides: Partial<EventsUpcomingRouteDependencies> = {},
): EventsUpcomingRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    listUpcoming: () => Promise.resolve({ next: null, totalCount: 0, upcoming: [] }),
    ...overrides,
  };
}

describe("GET /api/v1/events/upcoming", () => {
  it("answers with the hero event, the list under it and the real total", async () => {
    const { database } = eventsDatabase();

    const payload = EventsUpcomingResponseSchema.parse(
      await getHomeUpcomingEvents("u1", 3, {
        database,
        now: NOW,
        readPresence: fakePresenceReader({ u2: "ONLINE" }),
      }),
    );

    assert.equal(payload.next?.id, "ev-1");
    assert.equal(payload.next?.context, "Whispr · Sahne");
    assert.equal(payload.next?.startAt, "2026-08-19T10:00:00.000Z");
    assert.equal(payload.next?.attendeeCount, 12);
    assert.equal(payload.next?.interested, true);
    assert.deepEqual(
      payload.upcoming.map((event) => event.id),
      ["ev-2"],
    );
    assert.equal(payload.totalCount, 6);
    assert.equal(toRelativeAppHref(payload.next?.href ?? ""), payload.next?.href);
  });

  it("rejects a request without a session", async () => {
    const response = await eventsUpcomingRoute(
      new Request("https://whispr.test/api/v1/events/upcoming"),
      routeDependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("cannot see an event of a server the viewer does not belong to", async () => {
    const { calls, database } = eventsDatabase({ memberships: [] });

    const payload = await getHomeUpcomingEvents("u1", 3, {
      database,
      now: NOW,
      readPresence: fakePresenceReader(),
    });

    assert.deepEqual(payload, { next: null, totalCount: 0, upcoming: [] });
    assert.ok(!calls.some((call) => call.operation === "scheduledEvent.findMany"));
  });

  it("filters on the indexed triple rather than on the result", async () => {
    const { calls, database } = eventsDatabase();

    await getHomeUpcomingEvents("u1", 3, {
      database,
      now: NOW,
      readPresence: fakePresenceReader(),
    });

    const call = calls.find((entry) => entry.operation === "scheduledEvent.findMany");
    const args = call?.args as {
      orderBy?: unknown;
      where?: { scheduledStartAt?: { gte?: Date }; serverId?: { in?: string[] }; status?: string };
    };
    assert.deepEqual(args.where?.serverId?.in, ["s1"]);
    assert.equal(args.where?.status, "SCHEDULED");
    assert.deepEqual(args.where?.scheduledStartAt?.gte, NOW);
    assert.deepEqual(args.orderBy, [{ scheduledStartAt: "asc" }, { id: "asc" }]);
  });

  it("redacts an invisible attendee to offline", async () => {
    const { database } = eventsDatabase();

    const payload = await getHomeUpcomingEvents("u1", 3, {
      database,
      now: NOW,
      readPresence: fakePresenceReader({}),
    });

    assert.deepEqual(payload.next?.attendees, [
      { avatarUrl: null, displayName: "Ayşe", id: "u2", presence: "OFFLINE" },
    ]);
  });

  it("is registered in the rate limit table and charged before any work", async () => {
    assert.deepEqual(API_RATE_LIMITS["events:upcoming"], { limit: 120, windowSeconds: 60 });

    const recorded: string[] = [];
    await eventsUpcomingRoute(
      new Request("https://whispr.test/api/v1/events/upcoming"),
      routeDependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["events:upcoming"]);
  });

  it("costs four queries whatever the limit is", async () => {
    const small = eventsDatabase();
    await getHomeUpcomingEvents("u1", 1, {
      database: small.database,
      now: NOW,
      readPresence: fakePresenceReader(),
    });

    const large = eventsDatabase();
    await getHomeUpcomingEvents("u1", 10, {
      database: large.database,
      now: NOW,
      readPresence: fakePresenceReader(),
    });

    assert.equal(small.queryCount(), 4);
    assert.equal(large.queryCount(), 4);
  });
});
