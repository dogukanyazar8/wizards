import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EventsListResponseSchema } from "@wizards/types";

import { listEvents, type EventsDependencies } from "@/lib/events/events-service";
import { createFakeDatabase, sqlText } from "@/lib/home/home-test-doubles";

/**
 * Bu suit **projeksiyonu** ve **tur sayisini** olcer; gorunurluk dallarinin kendisi
 * `events-query.test.ts` icinde sorgu metni uzerinden kilitli. Ikisi ayri: biri satiri karta
 * cevirmenin dogrulugu, digeri o satirin hangi kumeden geldigi.
 */

const NOW = new Date("2026-08-26T09:00:00.000Z");
const ISTANBUL = "Europe/Istanbul";
const NEW_YORK = "America/New_York";

type Row = Record<string, unknown>;

function eventRow(overrides: Row = {}): Row {
  return {
    channelId: "c1",
    channelName: "tasarim-kritigi",
    channelType: "TEXT",
    description: "Kritik",
    endsAt: new Date("2026-08-26T13:45:00.000Z"),
    externalLocation: null,
    goingCount: 12,
    hostAvatarUrl: null,
    hostDisplayName: "Ayse Yilmaz",
    hostId: "u2",
    hostUsername: "ayse",
    id: "ev-1",
    isPublic: false,
    kind: "MEETING",
    maybeCount: 3,
    recurrenceRule: null,
    reminderEnabled: null,
    reminderMinutesBefore: null,
    rsvp: null,
    serverId: "s1",
    serverName: "Whispr",
    startsAt: new Date("2026-08-26T13:00:00.000Z"),
    status: "SCHEDULED",
    title: "Tasarim Kritigi",
    viewerIsMember: true,
    ...overrides,
  };
}

function countsRow(overrides: Row = {}): Row {
  return { all: 9, going: 2, live: 1, nextStartsAt: null, upcoming: 8, ...overrides };
}

function fakeEventsDatabase(input: {
  attendees?: readonly unknown[];
  counts?: readonly unknown[];
  page?: readonly unknown[];
  /** Cagri sirasini testin kendisi kurar — `limit=0` kipinde sayfa sorgusu hic kosmaz. */
  raw?: readonly unknown[];
  serverIds?: readonly string[];
  week?: readonly unknown[];
}) {
  return createFakeDatabase({
    models: {
      serverMember: {
        findMany: () => (input.serverIds ?? ["s1"]).map((serverId) => ({ serverId })),
      },
    },
    // Cagri sirasi: sayfa, sayaclar, hafta, katilimci onizlemesi.
    queryRaw: input.raw ?? [
      input.page ?? [],
      input.counts ?? [countsRow()],
      input.week ?? [],
      input.attendees ?? [],
    ],
  });
}

function dependencies(
  database: ReturnType<typeof fakeEventsDatabase>["database"],
  overrides: Partial<EventsDependencies> = {},
): EventsDependencies {
  return {
    database,
    now: NOW,
    readManageableServerIds: () => Promise.resolve(new Set<string>()),
    readViewerTimeZone: () => Promise.resolve(ISTANBUL),
    ...overrides,
  };
}

const BASE_QUERY = { limit: 24, tab: "all" as const, weekStart: "2026-08-24" };

describe("events service — projeksiyon", () => {
  it("kanalsız ve harici bağlantısız etkinlik listede kalır", async () => {
    const { database } = fakeEventsDatabase({
      page: [
        eventRow({ channelId: null, channelName: null, channelType: null, externalLocation: null }),
      ],
    });
    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", BASE_QUERY, dependencies(database)),
    );
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.channelId, null);
    assert.equal(payload.items[0]?.serverId, "s1");
  });
  it("satiri ekranin sozlesmesine cevirir; kanal basligi sunucudan gelir, istemci uretmez", async () => {
    const { database } = fakeEventsDatabase({ page: [eventRow()] });

    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", BASE_QUERY, dependencies(database)),
    );
    const [event] = payload.items;

    assert.ok(event);
    assert.equal(event.id, "ev-1");
    assert.equal(event.kind, "meeting");
    assert.equal(event.channelLabel, "#tasarim-kritigi");
    assert.equal(event.serverName, "Whispr");
    assert.equal(event.host.initials, "AY");
    assert.equal(event.durationMinutes, 45);
    assert.equal(event.isLive, false);
    assert.equal(event.rsvp, null);
    assert.equal(event.reminder, null);
    assert.equal(event.viewerIsMember, true);
    assert.equal(event.viewerCanManage, false);
  });

  it("sesli ve sahne kanallarinda diyez yazilmaz; harici etkinlik yerini kendisi tasir", async () => {
    const { database } = fakeEventsDatabase({
      page: [
        eventRow({ channelName: "Sahne", channelType: "STAGE", id: "ev-1" }),
        eventRow({
          channelId: null,
          channelName: null,
          channelType: null,
          externalLocation: "meet.whispr.dev/kritik",
          id: "ev-2",
        }),
      ],
    });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.channelLabel, "Sahne");
    assert.equal(payload.items[1]?.channelLabel, "meet.whispr.dev/kritik");
    assert.equal(payload.items[1]?.channelId, null);
  });

  it("canli etkinlik ACTIVE durumundan turer, ayri bir bayraktan degil", async () => {
    const { database } = fakeEventsDatabase({ page: [eventRow({ status: "ACTIVE" })] });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.isLive, true);
  });

  it("izleyicinin yaniti ve hatirlatmasi satirdan okunur", async () => {
    const { database } = fakeEventsDatabase({
      page: [eventRow({ reminderEnabled: true, reminderMinutesBefore: 10, rsvp: "MAYBE" })],
    });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.rsvp, "maybe");
    assert.deepEqual(payload.items[0]?.reminder, { enabled: true, minutesBefore: 10 });
  });

  it("viewerCanManage MANAGE_EVENTS cozumleyicisinden gelir, sahiplikten degil", async () => {
    const { database } = fakeEventsDatabase({ page: [eventRow()] });

    const payload = await listEvents(
      "u1",
      BASE_QUERY,
      dependencies(database, {
        readManageableServerIds: () => Promise.resolve(new Set(["s1"])),
      }),
    );

    assert.equal(payload.items[0]?.viewerCanManage, true);
  });

  it("uye olunmayan sunucunun herkese acik etkinliginde yetki sorulmaz", async () => {
    const { database } = fakeEventsDatabase({
      page: [eventRow({ isPublic: true, serverId: "s9", viewerIsMember: false })],
    });
    let asked: readonly string[] = ["not-called"];

    const payload = await listEvents(
      "u1",
      BASE_QUERY,
      dependencies(database, {
        readManageableServerIds: (_userId, serverIds) => {
          asked = serverIds;
          return Promise.resolve(new Set<string>());
        },
      }),
    );

    assert.deepEqual(asked, []);
    assert.equal(payload.items[0]?.viewerCanManage, false);
    assert.equal(payload.items[0]?.viewerIsMember, false);
  });

  it("bitis saati yoksa sure null kalir; istemci sifir dakika uydurmaz", async () => {
    const { database } = fakeEventsDatabase({ page: [eventRow({ endsAt: null })] });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.durationMinutes, null);
  });
});

describe("events service — gun kovasi izleyicinin saat diliminde (tuzak #7)", () => {
  const lateNight = eventRow({
    endsAt: null,
    id: "ev-late",
    startsAt: new Date("2026-08-26T20:30:00.000Z"),
  });

  it("Europe/Istanbul icin 23:30 baslayan etkinlik bugunun kovasindadir", async () => {
    const { database } = fakeEventsDatabase({ page: [lateNight] });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.dayBucket, "today");
  });

  it("America/New_York icin ayni an yarina dusmez — 16:30 hala bugundur", async () => {
    const { database } = fakeEventsDatabase({ page: [lateNight] });

    const payload = await listEvents(
      "u1",
      BASE_QUERY,
      dependencies(database, { readViewerTimeZone: () => Promise.resolve(NEW_YORK) }),
    );

    assert.equal(payload.items[0]?.dayBucket, "today");
  });

  it("Istanbul'da yarina gecen bir an New York'ta hala bugundur", async () => {
    const rows = [eventRow({ endsAt: null, startsAt: new Date("2026-08-26T21:30:00.000Z") })];

    const istanbul = fakeEventsDatabase({ page: rows });
    const newYork = fakeEventsDatabase({ page: rows });

    const inIstanbul = await listEvents("u1", BASE_QUERY, dependencies(istanbul.database));
    const inNewYork = await listEvents(
      "u1",
      BASE_QUERY,
      dependencies(newYork.database, { readViewerTimeZone: () => Promise.resolve(NEW_YORK) }),
    );

    assert.equal(inIstanbul.items[0]?.dayBucket, "tomorrow");
    assert.equal(inNewYork.items[0]?.dayBucket, "today");
  });

  it("bu haftanin ilerisi week, gecmis gun past kovasina duser", async () => {
    const { database } = fakeEventsDatabase({
      page: [
        eventRow({ endsAt: null, id: "ev-week", startsAt: new Date("2026-08-29T09:00:00.000Z") }),
        eventRow({ endsAt: null, id: "ev-past", startsAt: new Date("2026-08-20T09:00:00.000Z") }),
      ],
    });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.dayBucket, "week");
    assert.equal(payload.items[1]?.dayBucket, "past");
  });
});

describe("events service — baslamasina kalan sure", () => {
  it("yalniz 60 dakika ve altinda dolar", async () => {
    const { database } = fakeEventsDatabase({
      page: [
        eventRow({ endsAt: null, id: "ev-soon", startsAt: new Date("2026-08-26T09:12:00.000Z") }),
        eventRow({ endsAt: null, id: "ev-edge", startsAt: new Date("2026-08-26T10:00:00.000Z") }),
        eventRow({ endsAt: null, id: "ev-far", startsAt: new Date("2026-08-26T10:01:00.000Z") }),
        eventRow({
          endsAt: null,
          id: "ev-started",
          startsAt: new Date("2026-08-26T08:59:00.000Z"),
        }),
      ],
    });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.startsInMinutes, 12);
    assert.equal(payload.items[1]?.startsInMinutes, 60);
    assert.equal(payload.items[2]?.startsInMinutes, null);
    assert.equal(payload.items[3]?.startsInMinutes, null);
  });
});

describe("events service — katilimci onizlemesi", () => {
  it("en cok uc kisi cizilir ve going sayaci onizleme uzunlugundan bagimsizdir", async () => {
    const { database } = fakeEventsDatabase({
      attendees: [
        {
          avatarUrl: null,
          displayName: "Ayse Yilmaz",
          eventId: "ev-1",
          id: "u2",
          username: "ayse",
        },
        { avatarUrl: null, displayName: null, eventId: "ev-1", id: "u3", username: "mert" },
        { avatarUrl: null, displayName: "Zeynep Kaya", eventId: "ev-1", id: "u4", username: "zey" },
      ],
      page: [eventRow({ goingCount: 42 })],
    });

    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", BASE_QUERY, dependencies(database)),
    );

    assert.equal(payload.items[0]?.attendeePreview.length, 3);
    assert.equal(payload.items[0]?.goingCount, 42);
    assert.equal(payload.items[0]?.attendeePreview[1]?.initials, "M");
  });

  it("etkinligin sahibi onizlemede host rolunu tasir", async () => {
    const { database } = fakeEventsDatabase({
      attendees: [
        {
          avatarUrl: null,
          displayName: "Ayse Yilmaz",
          eventId: "ev-1",
          id: "u2",
          username: "ayse",
        },
      ],
      page: [eventRow({ hostId: "u2" })],
    });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.items[0]?.attendeePreview[0]?.role, "host");
  });

  it("sayfa bosken katilimci sorgusu hic kurulmaz", async () => {
    const { calls, database } = fakeEventsDatabase({ page: [] });

    await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(calls.filter((call) => call.operation === "$queryRaw").length, 3);
  });
});

describe("events service — sayaclar", () => {
  it("sayaclar sekme disinda hicbir suzgec uygulamaz (tuzak #3)", async () => {
    const { calls, database } = fakeEventsDatabase({
      counts: [countsRow({ all: 9 })],
      page: [eventRow()],
    });

    const payload = await listEvents(
      "u1",
      { ...BASE_QUERY, query: "oyun", serverId: "s1" },
      dependencies(database),
    );

    const countsCall = calls.filter((call) => call.operation === "$queryRaw")[1];
    const text = sqlText(countsCall?.args);

    assert.equal(payload.counts.all, 9);
    assert.ok(!text.includes("ILIKE"));
    assert.ok(!text.includes('e."serverId" = '));
  });

  it("liveNow canli sayisindan turer; sayfada canli olup olmamasi degistirmez", async () => {
    const { database } = fakeEventsDatabase({
      counts: [countsRow({ live: 0 })],
      page: [eventRow({ status: "ACTIVE" })],
    });

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.equal(payload.counts.liveNow, false);
  });

  it("siradaki etkinlik saati ISO olarak tasinir; nav ipucu bunu okur", async () => {
    const { database } = fakeEventsDatabase({
      counts: [countsRow({ live: 2, nextStartsAt: new Date("2026-08-26T13:00:00.000Z") })],
    });

    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", BASE_QUERY, dependencies(database)),
    );

    assert.equal(payload.counts.nextStartsAt, "2026-08-26T13:00:00.000Z");
    assert.equal(payload.counts.liveNow, true);
  });

  it("limit=0 kipinde yalniz sayac sorgusu kosar; kart ve hafta sorgusu hic kurulmaz", async () => {
    const { calls, database } = fakeEventsDatabase({ raw: [[countsRow({ all: 9, live: 2 })]] });

    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", { limit: 0, tab: "all" }, dependencies(database)),
    );

    assert.equal(calls.filter((call) => call.operation === "$queryRaw").length, 1);
    assert.deepEqual(payload.items, []);
    assert.deepEqual(payload.week, []);
    assert.equal(payload.nextCursor, null);
    assert.equal(payload.counts.all, 9);
    assert.equal(payload.counts.liveNow, true);
  });

  it("sayac satiri hic donmezse sifirlanir, patlamaz", async () => {
    const { database } = fakeEventsDatabase({ counts: [] });

    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", BASE_QUERY, dependencies(database)),
    );

    assert.deepEqual(payload.counts, {
      all: 0,
      going: 0,
      live: 0,
      liveNow: false,
      nextStartsAt: null,
      upcoming: 0,
    });
  });
});

describe("events service — hafta noktalari", () => {
  it("her zaman yedi gun doner; bos gun de bir kutudur", async () => {
    const { database } = fakeEventsDatabase({ week: [] });

    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", BASE_QUERY, dependencies(database)),
    );

    assert.equal(payload.week.length, 7);
    assert.equal(payload.week[0]?.date, "2026-08-24");
    assert.equal(payload.week[6]?.date, "2026-08-30");
    assert.deepEqual(payload.week[0]?.kinds, []);
  });

  it("gun basina en cok dort tur cizilir, ilk baslangic sirasiyla", async () => {
    const { database } = fakeEventsDatabase({
      week: [
        {
          count: 1,
          date: "2026-08-26",
          firstStartAt: new Date("2026-08-26T18:00:00.000Z"),
          kind: "WORKSHOP",
        },
        {
          count: 2,
          date: "2026-08-26",
          firstStartAt: new Date("2026-08-26T06:00:00.000Z"),
          kind: "VOICE",
        },
        {
          count: 1,
          date: "2026-08-26",
          firstStartAt: new Date("2026-08-26T08:00:00.000Z"),
          kind: "MEETING",
        },
        {
          count: 1,
          date: "2026-08-26",
          firstStartAt: new Date("2026-08-26T10:00:00.000Z"),
          kind: "GAME",
        },
        {
          count: 1,
          date: "2026-08-26",
          firstStartAt: new Date("2026-08-26T12:00:00.000Z"),
          kind: "LIVE",
        },
      ],
    });

    const payload = EventsListResponseSchema.parse(
      await listEvents("u1", BASE_QUERY, dependencies(database)),
    );
    const wednesday = payload.week.find((day) => day.date === "2026-08-26");

    assert.deepEqual(wednesday?.kinds, ["voice", "meeting", "game", "live"]);
    assert.equal(wednesday?.count, 6);
  });

  it("isToday izleyicinin saat diliminde isaretlenir", async () => {
    const { database } = fakeEventsDatabase({});

    const payload = await listEvents("u1", BASE_QUERY, dependencies(database));

    assert.deepEqual(
      payload.week.filter((day) => day.isToday).map((day) => day.date),
      ["2026-08-26"],
    );
  });

  it("hafta verilmediginde icinde bulunulan haftanin pazartesisi kullanilir", async () => {
    const { database } = fakeEventsDatabase({});

    const payload = await listEvents("u1", { limit: 24, tab: "all" }, dependencies(database));

    assert.equal(payload.week[0]?.date, "2026-08-24");
  });
});

describe("events service — sayfalama", () => {
  it("limit kadar satir doner ve fazladan okunan satir imlece donusur", async () => {
    const page = Array.from({ length: 3 }, (_value, index) =>
      eventRow({
        id: `ev-${index}`,
        startsAt: new Date(`2026-08-2${6 + index}T13:00:00.000Z`),
      }),
    );
    const { database } = fakeEventsDatabase({ page });

    const payload = await listEvents("u1", { ...BASE_QUERY, limit: 2 }, dependencies(database));

    assert.equal(payload.items.length, 2);
    assert.ok(payload.nextCursor);
    assert.equal(payload.items.at(-1)?.id, "ev-1");
  });

  it("son sayfada imlec null kalir", async () => {
    const { database } = fakeEventsDatabase({ page: [eventRow()] });

    const payload = await listEvents("u1", { ...BASE_QUERY, limit: 2 }, dependencies(database));

    assert.equal(payload.nextCursor, null);
  });

  it("gecmis dalinin imleci yonunu tasir; ayni etkinlik iki sayfada gorunmez", async () => {
    const page = [eventRow({ id: "ev-a" }), eventRow({ id: "ev-b" })];
    const { database } = fakeEventsDatabase({ page });

    const payload = await listEvents(
      "u1",
      { ...BASE_QUERY, limit: 1, time: "past" },
      dependencies(database),
    );

    assert.ok(payload.nextCursor);
    assert.ok(
      Buffer.from(payload.nextCursor ?? "", "base64url")
        .toString("utf8")
        .startsWith("desc|"),
    );
  });
});

describe("events service — sorgu butcesi", () => {
  it("tur sayisi sayfa buyuklugunden bagimsizdir", async () => {
    const small = fakeEventsDatabase({ attendees: [], page: [eventRow()] });
    const large = fakeEventsDatabase({
      attendees: [],
      page: Array.from({ length: 40 }, (_value, index) => eventRow({ id: `ev-${index}` })),
    });

    await listEvents("u1", { ...BASE_QUERY, limit: 1 }, dependencies(small.database));
    await listEvents("u1", { ...BASE_QUERY, limit: 50 }, dependencies(large.database));

    assert.equal(small.queryCount(), large.queryCount());
  });
});
