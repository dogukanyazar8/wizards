import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import {
  assertEventChannelMatchesKind,
  assertEventStartsInFuture,
  assertPublicEventAllowed,
  EVENT_KIND_CHANNEL_TYPES,
  EVENT_START_TOLERANCE_MS,
  resolveEventEntityType,
  resolveEventRsvpDelta,
  runEventRsvpTransaction,
  toScheduledEventKind,
  writeEventRsvpRow,
  type EventRsvpTransactionClient,
  type EventRsvpWriteClient,
} from "./mutations";

const EVENT_ID = "evt-1";
const USER_ID = "user-1";
const NOW = new Date("2026-08-21T09:00:00.000Z");

/* ------------------------------------------------------------------ saf katman */

describe("events mutations — saf kurallar", () => {
  describe("resolveEventRsvpDelta", () => {
    it("dokuz geçişin tamamını sabitler", () => {
      const table = [
        [null, null, 0, 0],
        [null, "GOING", 1, 0],
        [null, "MAYBE", 0, 1],
        ["GOING", null, -1, 0],
        ["GOING", "GOING", 0, 0],
        ["GOING", "MAYBE", -1, 1],
        ["MAYBE", null, 0, -1],
        ["MAYBE", "GOING", 1, -1],
        ["MAYBE", "MAYBE", 0, 0],
      ] as const;

      for (const [previous, next, going, maybe] of table) {
        assert.deepEqual(
          resolveEventRsvpDelta(previous, next),
          { going, maybe },
          `${previous} → ${next}`,
        );
      }
    });

    it("aynı yanıtın tekrarı sayacı oynatmaz", () => {
      assert.deepEqual(resolveEventRsvpDelta("GOING", "GOING"), { going: 0, maybe: 0 });
    });
  });

  describe("K10 — tür ↔ kanal kuralı", () => {
    it("her tür için izinli kanal tiplerini sabitler", () => {
      assert.deepEqual(EVENT_KIND_CHANNEL_TYPES, {
        community: ["STAGE"],
        game: ["VOICE"],
        live: ["STAGE"],
        meeting: ["TEXT", "VOICE"],
        voice: ["VOICE"],
        workshop: ["TEXT", "VOICE"],
      });
    });

    it("canlı yayın metin kanalına konamaz — 422", () => {
      assert.throws(
        () => assertEventChannelMatchesKind("live", "TEXT"),
        (error: unknown) =>
          error instanceof ApiError &&
          error.status === 422 &&
          error.code === "EVENT_KIND_CHANNEL_MISMATCH",
      );
    });

    it("sesli buluşma sahne kanalına konamaz", () => {
      assert.throws(() => assertEventChannelMatchesKind("voice", "STAGE"), ApiError);
    });

    it("toplantı hem metin hem sesli kanalda kurulabilir", () => {
      assert.doesNotThrow(() => assertEventChannelMatchesKind("meeting", "TEXT"));
      assert.doesNotThrow(() => assertEventChannelMatchesKind("workshop", "VOICE"));
    });
  });

  describe("entityType türetimi", () => {
    it("harici bağlantı EXTERNAL üretir", () => {
      assert.equal(
        resolveEventEntityType({ channelType: null, externalLocation: "https://meet.test" }),
        "EXTERNAL",
      );
    });

    it("sahne kanalı STAGE, sesli kanal VOICE üretir", () => {
      assert.equal(
        resolveEventEntityType({ channelType: "STAGE", externalLocation: null }),
        "STAGE",
      );
      assert.equal(
        resolveEventEntityType({ channelType: "VOICE", externalLocation: null }),
        "VOICE",
      );
    });

    it("metin kanalı EXTERNAL'e düşer — canlı yüzeyi yoktur", () => {
      assert.equal(
        resolveEventEntityType({ channelType: "TEXT", externalLocation: null }),
        "EXTERNAL",
      );
    });
  });

  describe("tür kolonu", () => {
    it("altı sunum türünü kolona çevirir", () => {
      assert.equal(toScheduledEventKind("voice"), "VOICE");
      assert.equal(toScheduledEventKind("community"), "COMMUNITY");
      assert.equal(toScheduledEventKind("workshop"), "WORKSHOP");
    });
  });

  describe("başlangıç zamanı", () => {
    it("5 dakikalık toleransın içinde kabul eder", () => {
      assert.doesNotThrow(() =>
        assertEventStartsInFuture(new Date(NOW.getTime() - EVENT_START_TOLERANCE_MS + 1_000), NOW),
      );
    });

    it("toleransın dışında 422 verir", () => {
      assert.throws(
        () =>
          assertEventStartsInFuture(
            new Date(NOW.getTime() - EVENT_START_TOLERANCE_MS - 1_000),
            NOW,
          ),
        (error: unknown) =>
          error instanceof ApiError && error.status === 422 && error.code === "EVENT_START_IN_PAST",
      );
    });
  });

  describe("K3 — isPublic yalnız COMMUNITY sunucuda", () => {
    it("COMMUNITY sunucuda kabul edilir", () => {
      assert.doesNotThrow(() => assertPublicEventAllowed(true, "COMMUNITY"));
    });

    it("PERSONAL sunucuda 422", () => {
      assert.throws(
        () => assertPublicEventAllowed(true, "PERSONAL"),
        (error: unknown) =>
          error instanceof ApiError &&
          error.status === 422 &&
          error.code === "EVENT_PUBLIC_REQUIRES_COMMUNITY",
      );
    });

    it("isPublic=false her sunucuda geçer", () => {
      assert.doesNotThrow(() => assertPublicEventAllowed(false, "PERSONAL"));
    });
  });
});

/* -------------------------------------------------------- satır yazma katmanı */

type InterestRow = { eventId: string; status: "GOING" | "MAYBE"; userId: string };

/**
 * Satır tablosunun bellek içi ikizi. Her deyim **atomik**: `updateMany` yalnız `where`e uyan
 * satırı çevirir, `createMany` `skipDuplicates` ile `@@unique([eventId, userId])`i taklit eder.
 * Yarış testleri bu atomikliğe dayanıyor.
 */
function interestStore(initial: InterestRow[] = []) {
  const rows = [...initial];
  const counters = { going: 0, maybe: 0 };

  const client: EventRsvpWriteClient = {
    scheduledEvent: {
      update: (args) => {
        const data = args.data as {
          interestedCount?: { decrement?: number; increment?: number };
          maybeCount?: { decrement?: number; increment?: number };
        };
        counters.going +=
          (data.interestedCount?.increment ?? 0) - (data.interestedCount?.decrement ?? 0);
        counters.maybe += (data.maybeCount?.increment ?? 0) - (data.maybeCount?.decrement ?? 0);
        return Promise.resolve({ id: EVENT_ID });
      },
    },
    scheduledEventInterest: {
      createMany: (args) => {
        const data = args.data as InterestRow[];
        let count = 0;
        for (const row of data) {
          const exists = rows.some(
            (existing) => existing.eventId === row.eventId && existing.userId === row.userId,
          );
          if (!exists) {
            rows.push({ ...row });
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
      deleteMany: (args) => {
        const where = args.where as InterestRow;
        const before = rows.length;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          const row = rows[index]!;
          if (
            row.eventId === where.eventId &&
            row.userId === where.userId &&
            row.status === where.status
          ) {
            rows.splice(index, 1);
          }
        }
        return Promise.resolve({ count: before - rows.length });
      },
      updateMany: (args) => {
        const where = args.where as InterestRow;
        const data = args.data as { status: "GOING" | "MAYBE" };
        let count = 0;
        for (const row of rows) {
          if (
            row.eventId === where.eventId &&
            row.userId === where.userId &&
            row.status === where.status
          ) {
            row.status = data.status;
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
  };

  return { client, counters, rows };
}

describe("events mutations — writeEventRsvpRow", () => {
  it("yanıtsızdan going'e tek satır ve +1 üretir", async () => {
    const store = interestStore();

    const result = await writeEventRsvpRow(store.client, {
      eventId: EVENT_ID,
      rsvp: "GOING",
      userId: USER_ID,
    });

    assert.deepEqual(result, { changed: true, delta: { going: 1, maybe: 0 }, rsvp: "GOING" });
    assert.deepEqual(store.rows, [{ eventId: EVENT_ID, status: "GOING", userId: USER_ID }]);
  });

  it("maybe → going iki sayacı aynı anda oynatır", async () => {
    const store = interestStore([{ eventId: EVENT_ID, status: "MAYBE", userId: USER_ID }]);

    const result = await writeEventRsvpRow(store.client, {
      eventId: EVENT_ID,
      rsvp: "GOING",
      userId: USER_ID,
    });

    assert.deepEqual(result.delta, { going: 1, maybe: -1 });
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0]?.status, "GOING");
  });

  it("aynı yanıtın tekrarı satırı da sayacı da oynatmaz", async () => {
    const store = interestStore([{ eventId: EVENT_ID, status: "GOING", userId: USER_ID }]);

    const result = await writeEventRsvpRow(store.client, {
      eventId: EVENT_ID,
      rsvp: "GOING",
      userId: USER_ID,
    });

    assert.deepEqual(result, { changed: false, delta: { going: 0, maybe: 0 }, rsvp: "GOING" });
  });

  it("null satırı siler ve doğru sayacı düşürür", async () => {
    const store = interestStore([{ eventId: EVENT_ID, status: "MAYBE", userId: USER_ID }]);

    const result = await writeEventRsvpRow(store.client, {
      eventId: EVENT_ID,
      rsvp: null,
      userId: USER_ID,
    });

    assert.deepEqual(result, { changed: true, delta: { going: 0, maybe: -1 }, rsvp: null });
    assert.deepEqual(store.rows, []);
  });

  it("yanıtı olmayanın null'ı hiçbir sayacı oynatmaz", async () => {
    const store = interestStore();

    const result = await writeEventRsvpRow(store.client, {
      eventId: EVENT_ID,
      rsvp: null,
      userId: USER_ID,
    });

    assert.deepEqual(result, { changed: false, delta: { going: 0, maybe: 0 }, rsvp: null });
  });

  it("başkasının satırına dokunmaz", async () => {
    const store = interestStore([{ eventId: EVENT_ID, status: "GOING", userId: "other" }]);

    await writeEventRsvpRow(store.client, { eventId: EVENT_ID, rsvp: null, userId: USER_ID });

    assert.deepEqual(store.rows, [{ eventId: EVENT_ID, status: "GOING", userId: "other" }]);
  });

  it("going → maybe → null → going döngüsü 20 turda sayaçları sapmadan bırakır", async () => {
    const store = interestStore();
    let going = 0;
    let maybe = 0;

    for (let turn = 0; turn < 20; turn += 1) {
      for (const rsvp of ["GOING", "MAYBE", null, "GOING"] as const) {
        const result = await writeEventRsvpRow(store.client, {
          eventId: EVENT_ID,
          rsvp,
          userId: USER_ID,
        });
        going += result.delta.going;
        maybe += result.delta.maybe;
      }
    }

    // Döngü `GOING` ile bitiyor: tam bir satır, tam bir sayı.
    assert.deepEqual({ going, maybe }, { going: 1, maybe: 0 });
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0]?.status, "GOING");
  });

  it("iki eşzamanlı going tek satır ve tek artış üretir", async () => {
    const store = interestStore();

    const [first, second] = await Promise.all([
      writeEventRsvpRow(store.client, { eventId: EVENT_ID, rsvp: "GOING", userId: USER_ID }),
      writeEventRsvpRow(store.client, { eventId: EVENT_ID, rsvp: "GOING", userId: USER_ID }),
    ]);

    assert.equal(store.rows.length, 1);
    assert.equal(first!.delta.going + second!.delta.going, 1);
    assert.equal(first!.delta.maybe + second!.delta.maybe, 0);
  });

  it("eşzamanlı maybe → going ikilisi tek geçiş üretir", async () => {
    const store = interestStore([{ eventId: EVENT_ID, status: "MAYBE", userId: USER_ID }]);

    const results = await Promise.all([
      writeEventRsvpRow(store.client, { eventId: EVENT_ID, rsvp: "GOING", userId: USER_ID }),
      writeEventRsvpRow(store.client, { eventId: EVENT_ID, rsvp: "GOING", userId: USER_ID }),
    ]);

    assert.equal(
      results.reduce((total, result) => total + result.delta.going, 0),
      1,
    );
    assert.equal(
      results.reduce((total, result) => total + result.delta.maybe, 0),
      -1,
    );
    assert.equal(store.rows.length, 1);
  });
});

/* ------------------------------------------------ RSVP transaction (K5 kenarı) */

const STARTS_AT = new Date("2026-09-01T15:00:00.000Z");

type TransactionCall = { args: Record<string, unknown>; operation: string };

/**
 * Transaction gövdesinin sahte istemcisi. `writeEventRsvpRow`un satır mantığı zaten yukarıda
 * sınandı; buradaki soru **hatırlatma kenarı**: tercih satırı yazılıyor mu, iş kuyruğa
 * giriyor mu, katılım geri alınınca iptal ediliyor mu.
 */
function transactionClient(
  options: { existingRsvp?: "GOING" | "MAYBE" | null; reminderMinutes?: number } = {},
) {
  const calls: TransactionCall[] = [];
  const record = (operation: string, args: unknown) => {
    calls.push({ args: (args ?? {}) as Record<string, unknown>, operation });
  };
  let current = options.existingRsvp ?? null;

  const client: EventRsvpTransactionClient = {
    outboxJob: {
      updateMany: (args) => {
        record("outboxJob.updateMany", args);
        return Promise.resolve({ count: 0 });
      },
      upsert: (args) => {
        record("outboxJob.upsert", args);
        return Promise.resolve(undefined);
      },
    },
    scheduledEvent: {
      update: (args) => {
        record("scheduledEvent.update", args);
        return Promise.resolve({ id: EVENT_ID });
      },
    },
    scheduledEventInterest: {
      createMany: (args) => {
        record("scheduledEventInterest.createMany", args);
        const created = current === null;
        current = (args.data as { status: "GOING" | "MAYBE" }[])[0]!.status;
        return Promise.resolve({ count: created ? 1 : 0 });
      },
      deleteMany: (args) => {
        record("scheduledEventInterest.deleteMany", args);
        const status = (args.where as { status: "GOING" | "MAYBE" }).status;
        const hit = current === status;
        if (hit) {
          current = null;
        }
        return Promise.resolve({ count: hit ? 1 : 0 });
      },
      updateMany: (args) => {
        record("scheduledEventInterest.updateMany", args);
        const status = (args.where as { status: "GOING" | "MAYBE" }).status;
        const hit = current === status;
        if (hit) {
          current = (args.data as { status: "GOING" | "MAYBE" }).status;
        }
        return Promise.resolve({ count: hit ? 1 : 0 });
      },
    },
    scheduledEventReminder: {
      findUnique: (args) => {
        record("scheduledEventReminder.findUnique", args);
        return Promise.resolve({ enabled: true, minutesBefore: options.reminderMinutes ?? 10 });
      },
      updateMany: (args) => {
        record("scheduledEventReminder.updateMany", args);
        return Promise.resolve({ count: 1 });
      },
      upsert: (args) => {
        record("scheduledEventReminder.upsert", args);
        return Promise.resolve(undefined);
      },
    },
  };

  return { calls, client };
}

function operations(calls: TransactionCall[]): string[] {
  return calls.map((call) => call.operation);
}

describe("events mutations — runEventRsvpTransaction", () => {
  it("going verince varsayılan hatırlatma satırını ve outbox işini kurar", async () => {
    const { calls, client } = transactionClient();

    const result = await runEventRsvpTransaction(client, {
      eventId: EVENT_ID,
      eventNotificationsEnabled: true,
      now: NOW,
      rsvp: "GOING",
      startsAt: STARTS_AT,
      userId: USER_ID,
    });

    assert.deepEqual(result, { delta: { going: 1, maybe: 0 }, scheduled: true });

    const upsert = calls.find((call) => call.operation === "scheduledEventReminder.upsert");
    assert.deepEqual(upsert?.args.create, {
      enabled: true,
      eventId: EVENT_ID,
      minutesBefore: 10,
      userId: USER_ID,
    });
    // `update: {}` — mevcut tercih olduğu gibi kalır.
    assert.deepEqual(upsert?.args.update, {});
    assert.ok(operations(calls).includes("outboxJob.upsert"));
  });

  it("30 dakikaya çekilmiş tercih ikinci Katıl tıkında 10 dakikaya dönmez", async () => {
    const { calls, client } = transactionClient({ existingRsvp: "GOING", reminderMinutes: 30 });

    await runEventRsvpTransaction(client, {
      eventId: EVENT_ID,
      eventNotificationsEnabled: true,
      now: NOW,
      rsvp: "GOING",
      startsAt: STARTS_AT,
      userId: USER_ID,
    });

    const job = calls.find((call) => call.operation === "outboxJob.upsert");
    assert.deepEqual((job?.args.create as { payload: unknown }).payload, {
      eventId: EVENT_ID,
      minutesBefore: 30,
      userId: USER_ID,
    });
  });

  it("null yanıtta tercih kapatılır ve iş CANCELLED durumuna çekilir", async () => {
    const { calls, client } = transactionClient({ existingRsvp: "GOING" });

    const result = await runEventRsvpTransaction(client, {
      eventId: EVENT_ID,
      eventNotificationsEnabled: true,
      now: NOW,
      rsvp: null,
      startsAt: STARTS_AT,
      userId: USER_ID,
    });

    assert.deepEqual(result, { delta: { going: -1, maybe: 0 }, scheduled: false });

    const disable = calls.find((call) => call.operation === "scheduledEventReminder.updateMany");
    // Satır **silinmez**, kapatılır: silmek kullanıcının seçtiği dakikayı da silmek olurdu.
    assert.deepEqual(disable?.args.data, { enabled: false });

    const cancel = calls.find((call) => call.operation === "outboxJob.updateMany");
    assert.deepEqual(cancel?.args.data, { status: "CANCELLED" });
  });

  it("maybe hatırlatmaya dokunmaz — belki diyen de hatırlatılmak isteyebilir", async () => {
    const { calls, client } = transactionClient({ existingRsvp: "GOING" });

    await runEventRsvpTransaction(client, {
      eventId: EVENT_ID,
      eventNotificationsEnabled: true,
      now: NOW,
      rsvp: "MAYBE",
      startsAt: STARTS_AT,
      userId: USER_ID,
    });

    assert.equal(
      operations(calls).some((operation) => operation.startsWith("scheduledEventReminder.")),
      false,
    );
    assert.equal(
      operations(calls).some((operation) => operation.startsWith("outboxJob.")),
      false,
    );
  });

  it("etkinlik tercihten daha yakınsa iş yazılmaz ve scheduled:false döner (tuzak #8)", async () => {
    const { calls, client } = transactionClient();

    const result = await runEventRsvpTransaction(client, {
      eventId: EVENT_ID,
      eventNotificationsEnabled: true,
      // Etkinlik 5 dk sonra, tercih 10 dk: `availableAt` geçmişte kalır.
      now: new Date(STARTS_AT.getTime() - 5 * 60_000),
      rsvp: "GOING",
      startsAt: STARTS_AT,
      userId: USER_ID,
    });

    assert.equal(result.scheduled, false);
    assert.equal(operations(calls).includes("outboxJob.upsert"), false);
    // Tercih yine kaydedilir; kaybolan bir şey yok.
    assert.ok(operations(calls).includes("scheduledEventReminder.upsert"));
  });

  it("eventNotifications=false kullanıcı için hiç iş yazılmaz", async () => {
    const { calls, client } = transactionClient();

    const result = await runEventRsvpTransaction(client, {
      eventId: EVENT_ID,
      eventNotificationsEnabled: false,
      now: NOW,
      rsvp: "GOING",
      startsAt: STARTS_AT,
      userId: USER_ID,
    });

    assert.equal(result.scheduled, false);
    assert.equal(operations(calls).includes("outboxJob.upsert"), false);
  });

  it("değişmeyen yanıt sayaç deyimi çıkarmaz", async () => {
    const { calls, client } = transactionClient({ existingRsvp: "GOING" });

    await runEventRsvpTransaction(client, {
      eventId: EVENT_ID,
      eventNotificationsEnabled: true,
      now: NOW,
      rsvp: "GOING",
      startsAt: STARTS_AT,
      userId: USER_ID,
    });

    assert.equal(operations(calls).includes("scheduledEvent.update"), false);
  });
});
