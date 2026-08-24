import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "@/lib/workspace/permissions";

import {
  decodeDiscoverEventCursor,
  encodeDiscoverEventCursor,
  listDiscoverEvents,
  setDiscoverEventInterest,
  type DiscoverEventInterestTransaction,
  type DiscoverEventSource,
  type DiscoverEventsDependencies,
} from "./events-service";

const NOW = new Date("2026-08-21T12:00:00.000Z");

function event(overrides: Partial<DiscoverEventSource> = {}): DiscoverEventSource {
  return {
    channel: {
      name: "Topluluk sahnesi",
      permissionOverrides: [],
    },
    entityType: "STAGE",
    externalLocation: null,
    id: "event-1",
    interestedCount: 2,
    name: "Topluluk sohbeti",
    scheduledEndAt: new Date("2026-08-21T14:00:00.000Z"),
    scheduledStartAt: new Date("2026-08-21T13:00:00.000Z"),
    serverDiscoverable: true,
    serverPublic: true,
    server: {
      id: "server-1",
      name: "Whispr Topluluğu",
      ownerId: "owner-1",
      roles: [
        {
          id: "everyone-1",
          isDefault: true,
          permissions: PermissionBits.VIEW_CHANNEL,
        },
      ],
    },
    ...overrides,
  };
}

function dependencies(
  rows: DiscoverEventSource[],
  overrides: Partial<DiscoverEventsDependencies> = {},
): DiscoverEventsDependencies {
  return {
    loadEvents: async ({ after, take }) => {
      const startIndex = after
        ? rows.findIndex(
            (row) =>
              row.id === after.id &&
              row.scheduledStartAt.getTime() === after.scheduledStartAt.getTime(),
          ) + 1
        : 0;
      return rows.slice(startIndex, startIndex + take);
    },
    loadInterestedEventIds: async () => new Set(["event-1"]),
    ...overrides,
  };
}

describe("discover events", () => {
  it("round-trips e|epochMs|id cursors", () => {
    const cursor = { id: "event-42", scheduledStartAt: NOW };
    assert.equal(encodeDiscoverEventCursor(cursor), `e|${NOW.getTime()}|event-42`);
    assert.deepEqual(decodeDiscoverEventCursor(encodeDiscoverEventCursor(cursor)), cursor);
  });

  it("drops private-channel events", async () => {
    const privateEvent = event({
      channel: {
        name: "Yönetim",
        permissionOverrides: [
          {
            allow: 0n,
            deny: PermissionBits.VIEW_CHANNEL,
            targetId: "everyone-1",
            targetType: "ROLE",
          },
        ],
      },
      id: "private",
    });
    const result = await listDiscoverEvents(
      "viewer-1",
      {},
      { now: NOW },
      dependencies([privateEvent]),
    );

    assert.deepEqual(result, { items: [], nextCursor: null });
  });

  it("does not trust candidates from an undiscoverable server or the past", async () => {
    const result = await listDiscoverEvents(
      "viewer-1",
      {},
      { now: NOW },
      dependencies([
        event({ id: "hidden", serverDiscoverable: false }),
        event({ id: "past", scheduledStartAt: new Date("2026-08-21T11:59:59.000Z") }),
      ]),
    );

    assert.deepEqual(result.items, []);
  });

  it("maps duration and all three location fallbacks", async () => {
    const result = await listDiscoverEvents(
      "viewer-1",
      {},
      { now: NOW },
      dependencies([
        event(),
        event({
          channel: null,
          entityType: "EXTERNAL",
          externalLocation: "Canlı yayın",
          id: "external",
          scheduledEndAt: new Date("2026-08-21T15:30:00.000Z"),
          scheduledStartAt: new Date("2026-08-21T14:00:00.000Z"),
        }),
        event({
          channel: null,
          entityType: "EXTERNAL",
          externalLocation: null,
          id: "server-only",
          scheduledEndAt: null,
          scheduledStartAt: new Date("2026-08-21T16:00:00.000Z"),
        }),
      ]),
    );

    assert.deepEqual(
      result.items.map(({ durationLabel, locationLabel }) => ({ durationLabel, locationLabel })),
      [
        { durationLabel: "1 sa", locationLabel: "Whispr Topluluğu › Topluluk sahnesi" },
        { durationLabel: "1 sa 30 dk", locationLabel: "Whispr Topluluğu › Canlı yayın" },
        { durationLabel: "", locationLabel: "Whispr Topluluğu" },
      ],
    );
  });

  it("loads viewer interests once for the returned page", async () => {
    const calls: string[][] = [];
    const result = await listDiscoverEvents(
      "viewer-1",
      {},
      { limit: 2, now: NOW },
      dependencies(
        [
          event(),
          event({ id: "event-2", scheduledStartAt: new Date("2026-08-21T14:00:00.000Z") }),
          event({ id: "event-3", scheduledStartAt: new Date("2026-08-21T15:00:00.000Z") }),
        ],
        {
          loadInterestedEventIds: async (_viewerId, eventIds) => {
            calls.push([...eventIds]);
            return new Set(["event-2"]);
          },
        },
      ),
    );

    assert.deepEqual(calls, [["event-1", "event-2"]]);
    assert.deepEqual(
      result.items.map(({ id, interested }) => ({ id, interested })),
      [
        { id: "event-1", interested: false },
        { id: "event-2", interested: true },
      ],
    );
    assert.equal(result.nextCursor, `e|${new Date("2026-08-21T14:00:00.000Z").getTime()}|event-2`);
  });
});

function interestTransaction() {
  const interestedUserIds = new Set<string>();
  let synchronizedCounts = { interestedCount: -1, maybeCount: -1 };
  const transaction: DiscoverEventInterestTransaction = {
    countInterested: async () => interestedUserIds.size,
    countMaybe: async () => 0,
    deleteInterest: async (_eventId, userId) => {
      interestedUserIds.delete(userId);
    },
    findEligibleEvent: async () => event(),
    synchronizeInterestedCount: async (_eventId, counts) => {
      synchronizedCounts = counts;
    },
    upsertInterest: async (_eventId, userId) => {
      interestedUserIds.add(userId);
    },
  };

  return { interestedUserIds, synchronizedCounts: () => synchronizedCounts, transaction };
}

describe("discover event interest", () => {
  it("is idempotent and derives the counter from interest rows", async () => {
    const state = interestTransaction();
    const dependencies = {
      transaction: async <T>(run: (tx: DiscoverEventInterestTransaction) => Promise<T>) =>
        run(state.transaction),
    };

    assert.deepEqual(
      await setDiscoverEventInterest("viewer-1", "event-1", true, { now: NOW }, dependencies),
      { interested: true, interestedCount: 1 },
    );
    assert.deepEqual(
      await setDiscoverEventInterest("viewer-1", "event-1", true, { now: NOW }, dependencies),
      { interested: true, interestedCount: 1 },
    );
    assert.deepEqual(state.synchronizedCounts(), { interestedCount: 1, maybeCount: 0 });

    assert.deepEqual(
      await setDiscoverEventInterest("viewer-1", "event-1", false, { now: NOW }, dependencies),
      { interested: false, interestedCount: 0 },
    );
    assert.deepEqual(state.synchronizedCounts(), { interestedCount: 0, maybeCount: 0 });
  });

  it("returns 404 when the event is not publicly eligible", async () => {
    const state = interestTransaction();
    state.transaction.findEligibleEvent = async () => null;

    await assert.rejects(
      setDiscoverEventInterest(
        "viewer-1",
        "missing",
        true,
        { now: NOW },
        { transaction: async (run) => run(state.transaction) },
      ),
      (error: unknown) =>
        error instanceof ApiError && error.status === 404 && error.code === "EVENT_NOT_FOUND",
    );
  });
});
