import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  buildServerScheduledEvent,
  cancelServerScheduledEventWithDatabase,
  getUpcomingServerScheduledEventWithDatabase,
  listServerScheduledEventsWithDatabase,
  setServerScheduledEventInterestWithDatabase,
} from "@/lib/workspace/scheduled-event-service";

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    channel: { _count: { voiceStates: 3 }, id: "c9", name: "live-room" },
    channelId: "c9",
    description: null,
    entityType: "VOICE" as const,
    externalLocation: null,
    id: "e1",
    interests: [],
    interestedCount: 12,
    name: "Topluluk buluşması",
    scheduledEndAt: null,
    scheduledStartAt: new Date("2026-08-11T18:00:00.000Z"),
    serverId: "s1",
    status: "SCHEDULED" as const,
    ...overrides,
  };
}

describe("buildServerScheduledEvent", () => {
  it("reads attendance off the bound channel's live headcount", () => {
    const event = buildServerScheduledEvent(buildRow() as never);

    assert.equal(event.attendeeCount, 3);
    assert.equal(event.channelName, "live-room");
    assert.equal(event.scheduledStartAt, "2026-08-11T18:00:00.000Z");
  });

  it("reports no attendance for an external event with no channel", () => {
    const event = buildServerScheduledEvent(
      buildRow({
        channel: null,
        channelId: null,
        entityType: "EXTERNAL" as const,
        externalLocation: "Kadıköy",
      }) as never,
    );

    assert.equal(event.attendeeCount, 0);
    assert.equal(event.channelName, null);
    assert.equal(event.externalLocation, "Kadıköy");
  });

  it("derives viewerInterested from the viewer-scoped interest row", () => {
    assert.equal(buildServerScheduledEvent(buildRow() as never).viewerInterested, false);
    assert.equal(
      buildServerScheduledEvent(buildRow({ interests: [{ id: "i1" }] }) as never).viewerInterested,
      true,
    );
  });

  it("never lets a drifted counter go negative and fail the schema", () => {
    const event = buildServerScheduledEvent(buildRow({ interestedCount: -3 }) as never);

    assert.equal(event.interestedCount, 0);
  });
});

describe("getUpcomingServerScheduledEventWithDatabase", () => {
  it("asks only for a scheduled event at or after now, soonest first", async () => {
    let captured: Record<string, unknown> | null = null;
    const database = {
      scheduledEvent: {
        findFirst: async (args: Record<string, unknown>) => {
          captured = args;
          return buildRow();
        },
      },
    } as never;
    const now = new Date("2026-08-10T12:00:00.000Z");

    const event = await getUpcomingServerScheduledEventWithDatabase(database, "s1", "u1", now);

    assert.equal(event?.id, "e1");
    const where = (captured as unknown as { where: Record<string, unknown> }).where;
    assert.equal(where.status, "SCHEDULED");
    assert.deepEqual(where.scheduledStartAt, { gte: now });
    assert.deepEqual((captured as unknown as { orderBy: unknown[] }).orderBy, [
      { scheduledStartAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("returns null rather than throwing when the server has no upcoming event", async () => {
    const database = { scheduledEvent: { findFirst: async () => null } } as never;

    assert.equal(await getUpcomingServerScheduledEventWithDatabase(database, "s1", null), null);
  });
});

describe("listServerScheduledEventsWithDatabase", () => {
  it("bounds a page and starts strictly after its keyset cursor", async () => {
    let captured: Record<string, unknown> | null = null;
    const database = {
      scheduledEvent: {
        findMany: async (args: Record<string, unknown>) => {
          captured = args;
          return [buildRow({ id: "e2" })];
        },
      },
    } as never;

    const events = await listServerScheduledEventsWithDatabase(database, "s1", "u1", {
      cursor: "e1",
      includePast: true,
      limit: 25,
    });

    assert.equal(events[0]?.id, "e2");
    assert.equal((captured as unknown as { take: number }).take, 25);
    assert.equal((captured as unknown as { skip: number }).skip, 1);
    assert.deepEqual((captured as unknown as { cursor: unknown }).cursor, { id: "e1" });
  });
});

type InterestCall = {
  kind: "create" | "delete" | "decrement" | "flip" | "increment";
  status?: "GOING" | "MAYBE";
};

/**
 * K1 sonrası çağrı sırası değişti: hedef durum önce **karşı yanıttaki** satırı çevirmeyi
 * dener (`updateMany`), olmazsa yaratır; geri alma iki `deleteMany` ile hangi sayacın
 * düşeceğini öğrenir. Sahte istemci bu sırayı olduğu gibi kaydeder.
 */
function buildInterestDatabase(options: {
  affectedRows: number;
  calls: InterestCall[];
  event?: Record<string, unknown> | null;
  flippedRows?: number;
  goingRows?: number;
  maybeRows?: number;
}) {
  const transaction = {
    scheduledEvent: {
      findUniqueOrThrow: async () => buildRow(),
      update: async (args: { data: Record<string, Record<string, number>> }) => {
        options.calls.push({
          kind: args.data.interestedCount?.increment ? "increment" : "decrement",
        });
        return { id: "e1" };
      },
    },
    scheduledEventInterest: {
      createMany: async () => {
        options.calls.push({ kind: "create" });
        return { count: options.affectedRows };
      },
      deleteMany: async (args: { where: { status: "GOING" | "MAYBE" } }) => {
        options.calls.push({ kind: "delete", status: args.where.status });
        return {
          count:
            args.where.status === "GOING"
              ? (options.goingRows ?? options.affectedRows)
              : (options.maybeRows ?? 0),
        };
      },
      updateMany: async (args: { where: { status: "GOING" | "MAYBE" } }) => {
        options.calls.push({ kind: "flip", status: args.where.status });
        return { count: options.flippedRows ?? 0 };
      },
    },
  };

  return {
    $transaction: async (run: (client: typeof transaction) => Promise<unknown>) => run(transaction),
    scheduledEvent: {
      findFirst: async () => (options.event === undefined ? { id: "e1" } : options.event),
    },
  } as never;
}

describe("setServerScheduledEventInterestWithDatabase", () => {
  it("moves the counter only when the interest row actually appeared", async () => {
    const calls: InterestCall[] = [];
    const database = buildInterestDatabase({ affectedRows: 1, calls });

    await setServerScheduledEventInterestWithDatabase(database, "u1", "s1", "e1", true);

    // Önce `MAYBE` satırı aranır (yok), sonra satır yaratılır, sonra sayaç artar.
    assert.deepEqual(calls, [
      { kind: "flip", status: "MAYBE" },
      { kind: "create" },
      { kind: "increment" },
    ]);
  });

  it("is idempotent: a repeated tap inserts nothing and leaves the counter alone", async () => {
    const calls: InterestCall[] = [];
    const database = buildInterestDatabase({ affectedRows: 0, calls });

    await setServerScheduledEventInterestWithDatabase(database, "u1", "s1", "e1", true);

    assert.deepEqual(calls, [{ kind: "flip", status: "MAYBE" }, { kind: "create" }]);
  });

  it("decrements only when a row was really removed", async () => {
    const removed: InterestCall[] = [];
    const missing: InterestCall[] = [];

    await setServerScheduledEventInterestWithDatabase(
      buildInterestDatabase({ affectedRows: 1, calls: removed }),
      "u1",
      "s1",
      "e1",
      false,
    );
    await setServerScheduledEventInterestWithDatabase(
      buildInterestDatabase({ affectedRows: 0, calls: missing }),
      "u1",
      "s1",
      "e1",
      false,
    );

    assert.deepEqual(removed, [
      { kind: "delete", status: "GOING" },
      { kind: "delete", status: "MAYBE" },
      { kind: "decrement" },
    ]);
    assert.deepEqual(missing, [
      { kind: "delete", status: "GOING" },
      { kind: "delete", status: "MAYBE" },
    ]);
  });

  it("K1 — silinen satır MAYBE ise düşen sayaç maybeCount olur, interestedCount değil", async () => {
    const calls: InterestCall[] = [];
    // `GOING` silmesi 0 satır, `MAYBE` silmesi 1 satır etkiler.
    const database = buildInterestDatabase({
      affectedRows: 0,
      calls,
      goingRows: 0,
      maybeRows: 1,
    });

    await setServerScheduledEventInterestWithDatabase(database, "u1", "s1", "e1", false);

    assert.deepEqual(calls, [
      { kind: "delete", status: "GOING" },
      { kind: "delete", status: "MAYBE" },
      // `update` sahtesi `interestedCount.increment` yoksa "decrement" diyor; asıl iddia
      // `mutations.test.ts`te: `MAYBE → null` deltası `{ going: 0, maybe: -1 }`.
      { kind: "decrement" },
    ]);
  });

  it("K1 — mevcut MAYBE satırı GOING'e çevrilir, ikinci satır yaratılmaz", async () => {
    const calls: InterestCall[] = [];
    const database = buildInterestDatabase({ affectedRows: 0, calls, flippedRows: 1 });

    await setServerScheduledEventInterestWithDatabase(database, "u1", "s1", "e1", true);

    assert.deepEqual(calls, [{ kind: "flip", status: "MAYBE" }, { kind: "increment" }]);
  });

  it("refuses an event that belongs to another server", async () => {
    const database = buildInterestDatabase({ affectedRows: 1, calls: [], event: null });

    await assert.rejects(
      setServerScheduledEventInterestWithDatabase(database, "u1", "s1", "e1", true),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "SCHEDULED_EVENT_NOT_FOUND");
        return true;
      },
    );
  });
});

describe("cancelServerScheduledEventWithDatabase", () => {
  it("sets the status instead of deleting the row", async () => {
    let captured: Record<string, unknown> | null = null;
    const database = {
      outboxJob: {
        // İptal, bekleyen hatırlatma işlerini de kapatır (K5).
        updateMany: async () => ({ count: 0 }),
      },
      scheduledEvent: {
        findFirst: async () => ({ id: "e1" }),
        update: async (args: Record<string, unknown>) => {
          captured = args;
          return buildRow({ status: "CANCELLED" as const });
        },
      },
    } as never;

    const event = await cancelServerScheduledEventWithDatabase(database, "u1", "s1", "e1");

    assert.equal(event.status, "CANCELLED");
    assert.deepEqual((captured as unknown as { data: unknown }).data, { status: "CANCELLED" });
  });
});
