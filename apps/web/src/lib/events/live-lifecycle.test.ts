import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_LIVE_COMPLETE_GRACE_MS,
  resolveEventLiveTransition,
  syncAndPublishEventLiveStateForChannel,
  syncEventLiveStateForChannel,
  type EventLiveLifecycleClient,
  type EventLiveLifecycleDatabase,
  type EventLiveLifecycleTransaction,
  type EventLiveTransition,
} from "./live-lifecycle";

const CHANNEL_ID = "chn-1";
const START = new Date("2026-09-01T15:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    channelId: CHANNEL_ID,
    entityType: "VOICE" as const,
    id: "evt-1",
    scheduledEndAt: null,
    scheduledStartAt: START,
    isPublic: false,
    serverId: "srv-1",
    status: "SCHEDULED" as const,
    ...overrides,
  };
}

type Recorded = { data: unknown; where: unknown };

function client(
  rows: ReturnType<typeof row>[],
  options: { occupancy?: number; updated?: number } = {},
) {
  const updates: Recorded[] = [];
  const lifecycle: EventLiveLifecycleClient = {
    scheduledEvent: {
      findMany: () => Promise.resolve(rows),
      updateMany: (args) => {
        updates.push({ data: args.data, where: args.where });
        return Promise.resolve({ count: options.updated ?? 1 });
      },
    },
    voiceState: {
      count: () => Promise.resolve(options.occupancy ?? 0),
    },
  };

  return { lifecycle, updates };
}

function transactionalDatabase(
  lifecycle: EventLiveLifecycleClient,
  trace: string[] = [],
): EventLiveLifecycleDatabase {
  return {
    $transaction: async <T>(
      callback: (transaction: EventLiveLifecycleTransaction) => Promise<T>,
    ): Promise<T> => {
      trace.push("transaction:begin");
      const result = await callback({
        ...lifecycle,
        $queryRaw: <R>() => {
          trace.push("channel:lock");
          return Promise.resolve(undefined as R);
        },
      });
      trace.push("transaction:commit");
      return result;
    },
  };
}

describe("events live-lifecycle — SCHEDULED ↔ ACTIVE ↔ COMPLETED", () => {
  describe("resolveEventLiveTransition (saf)", () => {
    it("pencere içinde ve kanal doluyken başlatır", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 1,
          now: new Date(START.getTime() - 10 * 60_000),
          startsAt: START,
          status: "SCHEDULED",
        }),
        "start",
      );
    });

    it("kilit yarışına bağlı olmayan COMPLETED etkinliği terminal tutar", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: null,
          entityType: "VOICE",
          occupancy: 3,
          now: new Date(START.getTime() + 17 * 24 * 60 * 60_000),
          startsAt: START,
          status: "COMPLETED",
        }),
        null,
      );
    });

    it("15 dk penceresinden önce başlatmaz", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 3,
          now: new Date(START.getTime() - 16 * 60_000),
          startsAt: START,
          status: "SCHEDULED",
        }),
        null,
      );
    });

    it("pencerenin tam sınırında başlatır", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 1,
          now: new Date(START.getTime() - 15 * 60_000),
          startsAt: START,
          status: "SCHEDULED",
        }),
        "start",
      );
    });

    it("kanal boşken başlatmaz", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 0,
          now: START,
          startsAt: START,
          status: "SCHEDULED",
        }),
        null,
      );
    });

    it("süresi ve payı geçmiş SCHEDULED etkinliği sonradan başlatmaz", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 1,
          now: new Date(START.getTime() + 45 * 60_000 + EVENT_LIVE_COMPLETE_GRACE_MS + 1),
          startsAt: START,
          status: "SCHEDULED",
        }),
        null,
      );
    });

    it("kanal boşalınca ACTIVE'i bitirir", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 0,
          now: new Date(START.getTime() + 5 * 60_000),
          startsAt: START,
          status: "ACTIVE",
        }),
        "end",
      );
    });

    it("kanal doluyken bile süre + 15 dk geçtiyse bitirir", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 4,
          now: new Date(START.getTime() + 45 * 60_000 + EVENT_LIVE_COMPLETE_GRACE_MS + 1),
          startsAt: START,
          status: "ACTIVE",
        }),
        "end",
      );
    });

    it("süre + 15 dk henüz dolmadıysa dolu kanalı bitirmez", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 4,
          now: new Date(START.getTime() + 45 * 60_000 + EVENT_LIVE_COMPLETE_GRACE_MS - 1),
          startsAt: START,
          status: "ACTIVE",
        }),
        null,
      );
    });

    it("süresi bilinmeyen ACTIVE etkinlik dolu kanalda süresiz sürer", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: null,
          entityType: "VOICE",
          occupancy: 2,
          now: new Date(START.getTime() + 10 * 60 * 60_000),
          startsAt: START,
          status: "ACTIVE",
        }),
        null,
      );
    });

    it("EXTERNAL etkinlikte otomatik geçiş yok — sahibi elle başlatır", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "EXTERNAL",
          occupancy: 9,
          now: START,
          startsAt: START,
          status: "SCHEDULED",
        }),
        null,
      );
    });

    it("CANCELLED etkinlik hiçbir geçiş üretmez", () => {
      assert.equal(
        resolveEventLiveTransition({
          durationMinutes: 45,
          entityType: "VOICE",
          occupancy: 3,
          now: START,
          startsAt: START,
          status: "CANCELLED",
        }),
        null,
      );
    });
  });

  describe("syncEventLiveStateForChannel", () => {
    it("sesli kanala ilk giriş etkinliği ACTIVE yapar", async () => {
      const { lifecycle, updates } = client([row()], { occupancy: 1 });

      const transitions = await syncEventLiveStateForChannel(lifecycle, {
        channelId: CHANNEL_ID,
        now: START,
      });

      assert.deepEqual(transitions, [
        {
          eventId: "evt-1",
          isPublic: false,
          serverId: "srv-1",
          transition: "start",
        } satisfies EventLiveTransition,
      ]);
      assert.deepEqual(updates[0]?.data, { status: "ACTIVE" });
      // Idempotent: `where` önceki durumu taşır, yarışan iki katılım tek geçiş üretir.
      assert.deepEqual(updates[0]?.where, {
        channel: { is: { voiceStates: { some: {} } } },
        id: "evt-1",
        status: "SCHEDULED",
      });
    });

    it("yarışan ikinci geçiş 0 satır günceller ve olay yayılmaz", async () => {
      const { lifecycle, updates } = client([row()], { occupancy: 2, updated: 0 });

      const transitions = await syncEventLiveStateForChannel(lifecycle, {
        channelId: CHANNEL_ID,
        now: START,
      });

      assert.deepEqual(transitions, []);
      assert.equal(updates.length, 1);
    });

    it("kanal boşalınca ACTIVE etkinliği COMPLETED yapar", async () => {
      const { lifecycle, updates } = client([row({ status: "ACTIVE" })], { occupancy: 0 });

      const transitions = await syncEventLiveStateForChannel(lifecycle, {
        channelId: CHANNEL_ID,
        now: new Date(START.getTime() + 60_000),
      });

      assert.deepEqual(transitions, [
        { eventId: "evt-1", isPublic: false, serverId: "srv-1", transition: "end" },
      ]);
      assert.deepEqual(updates[0]?.data, { status: "COMPLETED" });
      assert.deepEqual(updates[0]?.where, {
        channel: { is: { voiceStates: { none: {} } } },
        id: "evt-1",
        status: "ACTIVE",
      });
    });

    it("doluluk okumasından sonra biri katılırsa ACTIVE etkinliği bitirmez", async () => {
      const updates: Recorded[] = [];
      const lifecycle: EventLiveLifecycleClient = {
        scheduledEvent: {
          findMany: () => Promise.resolve([row({ status: "ACTIVE" })]),
          updateMany: (args) => {
            updates.push({ data: args.data, where: args.where });

            // `count()` boş döndükten sonra eşzamanlı bir katılım commit oldu. Gerçek DB'de
            // ilişki filtresi aynı UPDATE snapshot'ında bu satırı artık eşleştirmemeli.
            const relation = args.where?.channel;
            const guardedByCurrentOccupancy =
              typeof relation === "object" &&
              relation !== null &&
              "is" in relation &&
              relation.is !== null &&
              typeof relation.is === "object" &&
              "voiceStates" in relation.is;

            return Promise.resolve({ count: guardedByCurrentOccupancy ? 0 : 1 });
          },
        },
        voiceState: {
          count: () => Promise.resolve(0),
        },
      };

      const transitions = await syncEventLiveStateForChannel(lifecycle, {
        channelId: CHANNEL_ID,
        now: new Date(START.getTime() + 60_000),
      });

      assert.deepEqual(transitions, []);
      assert.equal(updates.length, 1);
    });

    it("geçişi sunucu ve public odalarına doğru görünürlükle yayınlar", async () => {
      const { lifecycle } = client([row({ isPublic: true })], { occupancy: 1 });
      const published: unknown[] = [];
      const trace: string[] = [];

      await syncAndPublishEventLiveStateForChannel(
        transactionalDatabase(lifecycle, trace),
        { channelId: CHANNEL_ID, now: START },
        {
          publishEventLiveEnded: (payload, isPublic) => {
            trace.push("publish");
            published.push({ event: "ended", isPublic, payload });
          },
          publishEventLiveStarted: (payload, isPublic) => {
            trace.push("publish");
            published.push({ event: "started", isPublic, payload });
          },
        },
      );

      assert.deepEqual(published, [
        {
          event: "started",
          isPublic: true,
          payload: { eventId: "evt-1", serverId: "srv-1" },
        },
      ]);
      assert.deepEqual(trace, [
        "transaction:begin",
        "channel:lock",
        "transaction:commit",
        "publish",
      ]);
    });

    it("geçiş gerekmiyorsa hiç yazmaz", async () => {
      const { lifecycle, updates } = client([row()], { occupancy: 0 });

      const transitions = await syncEventLiveStateForChannel(lifecycle, {
        channelId: CHANNEL_ID,
        now: new Date(START.getTime() - 60 * 60_000),
      });

      assert.deepEqual(transitions, []);
      assert.deepEqual(updates, []);
    });

    it("kanalda etkinlik yoksa doluluk bile sorulmaz", async () => {
      let asked = false;
      const lifecycle: EventLiveLifecycleClient = {
        scheduledEvent: {
          findMany: () => Promise.resolve([]),
          updateMany: () => Promise.resolve({ count: 0 }),
        },
        voiceState: {
          count: () => {
            asked = true;
            return Promise.resolve(0);
          },
        },
      };

      assert.deepEqual(
        await syncEventLiveStateForChannel(lifecycle, { channelId: CHANNEL_ID, now: START }),
        [],
      );
      assert.equal(asked, false);
    });

    it("süre scheduledEndAt'ten türetilir", async () => {
      const { lifecycle, updates } = client(
        [
          row({
            scheduledEndAt: new Date(START.getTime() + 30 * 60_000),
            status: "ACTIVE",
          }),
        ],
        { occupancy: 5 },
      );

      // 30 dk süre + 15 dk pay = 45 dk. 46. dakikada dolu kanal bile kapanır.
      await syncEventLiveStateForChannel(lifecycle, {
        channelId: CHANNEL_ID,
        now: new Date(START.getTime() + 46 * 60_000),
      });

      assert.deepEqual(updates[0]?.data, { status: "COMPLETED" });
    });
  });
});
