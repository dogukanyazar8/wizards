import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EventDetailSchema } from "@wizards/types";

import { ApiError } from "@/lib/api";
import { PermissionBits } from "@/lib/workspace/permissions";

import { EVENT_ATTENDEE_PAGE_SIZE } from "./attendee-roles";
import {
  EventDetailResponseSchema,
  getEventDetail,
  type EventDetailDatabase,
  type EventDetailDependencies,
} from "./detail-service";

/* --------------------------------------------------------------- test çift */

type Handler = (args: Record<string, unknown>) => unknown;

type FakeDatabase = {
  readonly calls: { args: Record<string, unknown>; operation: string }[];
  readonly database: EventDetailDatabase;
  readonly operations: () => string[];
};

function createFakeDatabase(handlers: Readonly<Record<string, Handler>> = {}): FakeDatabase {
  const calls: { args: Record<string, unknown>; operation: string }[] = [];

  const database = new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_modelTarget, operation: string) => (args: Record<string, unknown>) => {
              const key = `${model}.${operation}`;
              calls.push({ args: args ?? {}, operation: key });

              const handler = handlers[key];
              if (handler) {
                return Promise.resolve(handler(args ?? {}));
              }

              if (operation === "count") {
                return Promise.resolve(0);
              }

              return Promise.resolve(operation === "findMany" ? [] : null);
            },
          },
        ),
    },
  ) as unknown as EventDetailDatabase;

  return { calls, database, operations: () => calls.map((call) => call.operation) };
}

/* ------------------------------------------------------------------ veriler */

const NOW = new Date("2026-08-21T12:00:00.000Z");
const VIEWER = "viewer-1";

const MEMBER_ROLE = {
  color: 0,
  id: "role-everyone",
  isDefault: true,
  name: "@everyone",
  permissions: PermissionBits.VIEW_CHANNEL | PermissionBits.CONNECT_VOICE,
};

function user(id: string, displayName: string, username = id) {
  return { avatarUrl: null, displayName, id, username };
}

type EventRowOverrides = Record<string, unknown>;

function eventRow(overrides: EventRowOverrides = {}) {
  return {
    channel: {
      id: "c1",
      locked: false,
      name: "tasarım-kritiği",
      permissionOverrides: [],
      type: "VOICE",
    },
    channelId: "c1",
    creator: user("host-1", "Selin Aksoy", "selin"),
    creatorId: "host-1",
    description: "Kart yoğunluğu kararını ele alacağız.",
    entityType: "VOICE",
    externalLocation: null,
    id: "e1",
    interestedCount: 3,
    interests: [],
    isPublic: false,
    kind: "VOICE",
    maybeCount: 1,
    name: "Tasarım Kritiği",
    recurrenceRule: null,
    reminders: [],
    scheduledEndAt: new Date("2026-08-21T15:45:00.000Z"),
    scheduledStartAt: new Date("2026-08-21T15:00:00.000Z"),
    server: {
      id: "s1",
      members: [{ id: "m1", roles: [{ role: MEMBER_ROLE }] }],
      name: "Whispr Topluluğu",
      ownerId: "host-1",
      roles: [MEMBER_ROLE],
    },
    serverId: "s1",
    status: "SCHEDULED",
    ...overrides,
  };
}

function interestRow(id: string, name: string, minutes: number, status: "GOING" | "MAYBE") {
  return {
    createdAt: new Date(`2026-08-21T09:${String(minutes).padStart(2, "0")}:00.000Z`),
    status,
    user: user(id, name),
    userId: id,
  };
}

function dependencies(
  overrides: Partial<EventDetailDependencies> & { database: EventDetailDatabase },
): EventDetailDependencies {
  return { now: NOW, requestTimeZone: "Europe/Istanbul", ...overrides };
}

async function readDetail(
  fake: FakeDatabase,
  options: { attendeeCursor?: string | null } = {},
  viewerId = VIEWER,
) {
  return getEventDetail(viewerId, "e1", options, dependencies({ database: fake.database }));
}

/* ------------------------------------------------------------ 1. erişim */

describe("events detail — erişim kuralı", () => {
  it("görmediği etkinlikte 404 döner, 403 DEĞİL (403 varlığı sızdırır)", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => null });

    const error = await readDetail(fake).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 404);
    assert.notEqual(error.status, 403);
  });

  it("görünürlüğü sorgunun kendi süzgeci yapar, sonucuna uygulanan ikinci bir kontrol değil", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    await readDetail(fake);

    const where = (
      fake.calls.find((call) => call.operation === "scheduledEvent.findFirst")?.args as {
        where?: { OR?: unknown[]; id?: string };
      }
    ).where;

    assert.equal(where?.id, "e1");
    assert.equal(where?.OR?.length, 2, "üyelik ve herkese açık dalları sorguda");
    assert.match(JSON.stringify(where), /isPublic/u);
    assert.match(JSON.stringify(where), /viewer-1/u);
  });

  it("üye olmayan izleyici herkese açık etkinliği görüyor, viewerIsMember false", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({
          isPublic: true,
          server: { id: "s1", members: [], name: "Whispr Topluluğu", ownerId: "host-1", roles: [] },
        }),
    });

    const detail = await readDetail(fake);

    assert.equal(detail.viewerIsMember, false);
    assert.equal(detail.isPublic, true);
    assert.equal(detail.viewerCanManage, false);
  });

  it("üye izleyicide viewerIsMember true", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    assert.equal((await readDetail(fake)).viewerIsMember, true);
  });
});

/* ------------------------------------------------------- 2. katılımcılar */

describe("events detail — katılımcı rolleri", () => {
  it("SCHEDULED etkinlikte VoiceState sorgusu HİÇ açılmaz", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ status: "SCHEDULED" }),
      "scheduledEventInterest.findMany": () => [interestRow("u1", "Mert Kaya", 10, "GOING")],
    });

    await readDetail(fake);

    assert.deepEqual(
      fake.operations().filter((operation) => operation.startsWith("voiceState.")),
      [],
    );
  });

  it("ACTIVE etkinlikte hem GOING hem VoiceState olan kişi tek satırda ve listening", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ status: "ACTIVE" }),
      "scheduledEventInterest.findMany": () => [interestRow("u1", "Mert Kaya", 10, "GOING")],
      "voiceState.findMany": () => [
        { joinedAt: new Date("2026-08-21T11:50:00.000Z"), user: user("u1", "Mert Kaya") },
      ],
    });

    const detail = await readDetail(fake);
    const mert = detail.attendees.filter((attendee) => attendee.id === "u1");

    assert.equal(mert.length, 1, "bir kişi tek satırda");
    assert.equal(mert[0]?.role, "listening");
    assert.ok(fake.operations().includes("voiceState.findMany"));
  });

  it("sıra host → listening → going → maybe", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ status: "ACTIVE" }),
      "scheduledEventInterest.findMany": (args) => {
        const where = args.where as { status?: string };
        return where?.status === "GOING"
          ? [interestRow("u2", "Zeynep An", 10, "GOING")]
          : [interestRow("u3", "Can Öztürk", 11, "MAYBE")];
      },
      "voiceState.findMany": () => [
        { joinedAt: new Date("2026-08-21T11:50:00.000Z"), user: user("u1", "Mert Kaya") },
      ],
    });

    assert.deepEqual(
      (await readDetail(fake)).attendees.map((attendee) => attendee.role),
      ["host", "listening", "going", "maybe"],
    );
  });

  it("sahip listede tek kez, RSVP satırı olsa bile", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow(),
      "scheduledEventInterest.findMany": (args) =>
        (args.where as { status?: string })?.status === "GOING"
          ? [interestRow("host-1", "Selin Aksoy", 5, "GOING")]
          : [],
    });

    const detail = await readDetail(fake);

    assert.deepEqual(
      detail.attendees.filter((attendee) => attendee.id === "host-1").map((a) => a.role),
      ["host"],
    );
  });

  it("attendeePreview en çok 3 kişi taşır", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow(),
      "scheduledEventInterest.findMany": (args) =>
        (args.where as { status?: string })?.status === "GOING"
          ? [
              interestRow("u1", "Bir Kişi", 1, "GOING"),
              interestRow("u2", "İki Kişi", 2, "GOING"),
              interestRow("u3", "Üç Kişi", 3, "GOING"),
              interestRow("u4", "Dört Kişi", 4, "GOING"),
            ]
          : [],
    });

    assert.equal((await readDetail(fake)).attendeePreview.length, 3);
  });
});

/* --------------------------------------------------------- 3. sayfalama */

describe("events detail — katılımcı sayfalaması", () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    interestRow(`g${index}`, `Kişi ${index}`, index, "GOING"),
  );

  /** Keyset ve `notIn` süzgeçlerini gerçekten uygular; taklit ederse imleç sınanmamış olur. */
  function selectGoing(args: Record<string, unknown>) {
    const where = args.where as {
      OR?: { createdAt?: { gt?: Date } }[];
      status?: string;
      userId?: { notIn?: string[] };
    };

    if (where?.status !== "GOING") {
      return [];
    }

    const after = where.OR?.[0]?.createdAt?.gt ?? null;
    const excluded = new Set(where.userId?.notIn ?? []);

    return many.filter(
      (row) =>
        !excluded.has(row.userId) && (after === null || row.createdAt.getTime() > after.getTime()),
    );
  }

  function pagedDatabase() {
    return createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow(),
      "scheduledEventInterest.count": (args) => selectGoing(args).length,
      "scheduledEventInterest.findMany": (args) =>
        selectGoing(args).slice(0, Number(args.take ?? Number.MAX_SAFE_INTEGER)),
    });
  }

  it("ilk sayfa 8 kişi, attendeeMoreCount kalanı verir", async () => {
    const detail = await readDetail(pagedDatabase());

    assert.equal(detail.attendees.length, EVENT_ATTENDEE_PAGE_SIZE);
    // 1 sahip + 12 GOING = 13 kişi; 8'i döndü.
    assert.equal(detail.attendeeMoreCount, 13 - EVENT_ATTENDEE_PAGE_SIZE);
    assert.ok(detail.attendeeNextCursor);
  });

  it("ikinci sayfa aynı kişiyi tekrarlamıyor", async () => {
    const first = await readDetail(pagedDatabase());
    const second = await readDetail(pagedDatabase(), { attendeeCursor: first.attendeeNextCursor });

    const firstIds = new Set(first.attendees.map((attendee) => attendee.id));
    const repeated = second.attendees.filter((attendee) => firstIds.has(attendee.id));

    assert.deepEqual(repeated, []);
    // Sahip listede değil ama bilgi kartındaki avatar harfsiz kalmamalı.
    assert.equal(second.host.initials, "SA");
    // 13 kişinin 8'i birinci sayfada; ikinci sayfa kalan 5'i getirir ve orada biter.
    assert.equal(second.attendees.length, 5);
    assert.equal(second.attendeeMoreCount, 0);
    assert.equal(second.attendeeNextCursor, null);
  });

  it("liste sığdığında imleç yok ve attendeeMoreCount sıfır", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow(),
      "scheduledEventInterest.count": (args) =>
        (args.where as { status?: string })?.status === "GOING" ? 2 : 0,
      "scheduledEventInterest.findMany": (args) =>
        (args.where as { status?: string })?.status === "GOING"
          ? [interestRow("u1", "Bir", 1, "GOING"), interestRow("u2", "İki", 2, "GOING")]
          : [],
    });

    const detail = await readDetail(fake);

    assert.equal(detail.attendeeMoreCount, 0);
    assert.equal(detail.attendeeNextCursor, null);
  });

  it("sayım sorgusu sahibi ve dinleyicileri iki kez saymaz", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow(),
      "scheduledEventInterest.count": () => 0,
    });

    await readDetail(fake);

    const counts = fake.calls.filter((call) => call.operation === "scheduledEventInterest.count");
    assert.equal(counts.length, 2, "GOING ve MAYBE için birer sayım");
    assert.match(JSON.stringify(counts[0]?.args), /host-1/u, "sahip sayımdan düşülür");
  });
});

/* ----------------------------------------------------------- 4. hatırlatma */

describe("events detail — hatırlatma okuması", () => {
  it("satır yokken reminder null", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    const detail = await readDetail(fake);

    assert.equal(detail.reminder, null);
    assert.equal(detail.reminderSuppressed, false);
  });

  it("satır varken minutesBefore doğru", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({ reminders: [{ enabled: true, minutesBefore: 30 }] }),
    });

    assert.deepEqual((await readDetail(fake)).reminder, { enabled: true, minutesBefore: 30 });
  });

  it("eventNotifications=false iken gerçek satır döner ama reminderSuppressed true", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({ reminders: [{ enabled: true, minutesBefore: 10 }] }),
      "user.findUnique": () => ({
        notificationSettings: { eventNotifications: false },
        settings: { timeZone: "Europe/Istanbul" },
      }),
    });

    const detail = await readDetail(fake);

    assert.deepEqual(detail.reminder, { enabled: true, minutesBefore: 10 });
    assert.equal(detail.reminderSuppressed, true);
  });

  it("hatırlatma satırı izleyiciye özeldir — sorgu izleyiciyle süzülür", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    await readDetail(fake);

    const select = JSON.stringify(
      fake.calls.find((call) => call.operation === "scheduledEvent.findFirst")?.args,
    );
    assert.match(select, /reminders/u);
    assert.match(select, /viewer-1/u);
  });
});

/* ------------------------------------------------------------------ 5. CTA */

describe("events detail — CTA durumu", () => {
  it("canJoinLive yalnız ACTIVE + bağlı kanal + izleyici kanala girebiliyorken true", async () => {
    const live = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ status: "ACTIVE" }),
    });
    assert.equal((await readDetail(live)).canJoinLive, true);

    const scheduled = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    assert.equal((await readDetail(scheduled)).canJoinLive, false);
  });

  it("kanala giremeyen izleyicide canJoinLive false ve joinHref null", async () => {
    const denied = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({
          channel: {
            id: "c1",
            locked: false,
            name: "gizli",
            permissionOverrides: [
              {
                allow: 0n,
                deny: PermissionBits.VIEW_CHANNEL,
                targetId: "role-everyone",
                targetType: "ROLE",
              },
            ],
            type: "VOICE",
          },
          status: "ACTIVE",
        }),
    });

    const detail = await readDetail(denied);

    assert.equal(detail.canJoinLive, false);
    assert.equal(detail.joinHref, null);
  });

  it("sesli kanalda CONNECT_VOICE olmadan katılınamaz", async () => {
    const denied = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({
          server: {
            id: "s1",
            members: [
              {
                id: "m1",
                roles: [
                  {
                    role: { ...MEMBER_ROLE, permissions: PermissionBits.VIEW_CHANNEL },
                  },
                ],
              },
            ],
            name: "Whispr Topluluğu",
            ownerId: "someone-else",
            roles: [{ ...MEMBER_ROLE, permissions: PermissionBits.VIEW_CHANNEL }],
          },
          status: "ACTIVE",
        }),
    });

    const detail = await readDetail(denied);

    assert.equal(detail.canJoinLive, false);
    assert.equal(detail.joinHref, "/channels/s1/c1", "görebiliyor ama bağlanamıyor");
  });

  it("joinHref harici etkinlikte null", async () => {
    const external = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({
          channel: null,
          channelId: null,
          entityType: "EXTERNAL",
          externalLocation: "https://meet.example/tasarim",
          kind: "MEETING",
          status: "ACTIVE",
        }),
    });

    const detail = await readDetail(external);

    assert.equal(detail.joinHref, null);
    assert.equal(detail.canJoinLive, false);
  });

  it("joinHref sunucuda üretilir — kanal yolunu istemci kurmaz", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    assert.equal((await readDetail(fake)).joinHref, "/channels/s1/c1");
  });

  it("rsvp alanı izleyicinin kendi satırından gelir", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ interests: [{ status: "MAYBE" }] }),
    });

    assert.equal((await readDetail(fake)).rsvp, "maybe");
  });
});

/* -------------------------------------------------------------- 6. sözleşme */

describe("events detail — yanıt sözleşmesi", () => {
  it("EventDetail şemasını geçer", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    const detail = await readDetail(fake);

    EventDetailSchema.parse(detail);
    EventDetailResponseSchema.parse(detail);
  });

  it("hiçbir görüntülenecek Türkçe metin taşımaz — sayı ve enum döner", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    const detail = await readDetail(fake);

    for (const forbidden of ["durationLabel", "startsInLabel", "dayLabel", "recurrenceLabel"]) {
      assert.ok(!(forbidden in detail), `${forbidden} sunucudan gelmez`);
    }

    assert.equal(detail.durationMinutes, 45);
    assert.equal(detail.dayBucket, "today");
    assert.equal(detail.recurrenceRule, null);
  });

  it("dayBucket izleyicinin saat diliminde hesaplanır", async () => {
    // 21:30 UTC — İstanbul'da 22 Ağustos 00:30, New York'ta 21 Ağustos 17:30.
    const row = () => eventRow({ scheduledStartAt: new Date("2026-08-21T21:30:00.000Z") });

    const istanbul = await getEventDetail(
      VIEWER,
      "e1",
      {},
      dependencies({
        database: createFakeDatabase({ "scheduledEvent.findFirst": row }).database,
        requestTimeZone: "Europe/Istanbul",
      }),
    );
    const newYork = await getEventDetail(
      VIEWER,
      "e1",
      {},
      dependencies({
        database: createFakeDatabase({ "scheduledEvent.findFirst": row }).database,
        requestTimeZone: "America/New_York",
      }),
    );

    assert.equal(istanbul.dayBucket, "tomorrow");
    assert.equal(newYork.dayBucket, "today");
  });

  it("hesap saat dilimi tercihi istek başlığını ezer", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({ scheduledStartAt: new Date("2026-08-21T21:30:00.000Z") }),
      "user.findUnique": () => ({
        notificationSettings: { eventNotifications: true },
        settings: { timeZone: "America/New_York" },
      }),
    });

    const detail = await getEventDetail(
      VIEWER,
      "e1",
      {},
      dependencies({ database: fake.database, requestTimeZone: "Europe/Istanbul" }),
    );

    assert.equal(detail.dayBucket, "today");
  });

  it("startsInMinutes yalnız 60 dk eşiğinin altında dolu", async () => {
    const soon = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({ scheduledStartAt: new Date("2026-08-21T12:12:00.000Z") }),
    });
    assert.equal((await readDetail(soon)).startsInMinutes, 12);

    const later = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    assert.equal((await readDetail(later)).startsInMinutes, null);
  });

  it("bitişi olmayan etkinlikte durationMinutes null", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ scheduledEndAt: null }),
    });

    assert.equal((await readDetail(fake)).durationMinutes, null);
  });

  it("K1 — goingCount interestedCount sütunundan, maybeCount ikizinden gelir", async () => {
    const fake = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    const detail = await readDetail(fake);

    assert.equal(detail.goingCount, 3);
    assert.equal(detail.maybeCount, 1);
  });

  it("negatif sayaç şemayı düşürmez", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ interestedCount: -2, maybeCount: -1 }),
    });
    const detail = await readDetail(fake);

    assert.equal(detail.goingCount, 0);
    assert.equal(detail.maybeCount, 0);
  });

  it("K2 — sunum türü küçük harfli enuma çevrilir", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () => eventRow({ kind: "WORKSHOP" }),
    });

    assert.equal((await readDetail(fake)).kind, "workshop");
  });

  it("K4 — MANAGE_EVENTS taşıyan izleyicide viewerCanManage true", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({
          server: {
            id: "s1",
            members: [
              {
                id: "m1",
                roles: [{ role: { ...MEMBER_ROLE, permissions: PermissionBits.MANAGE_EVENTS } }],
              },
            ],
            name: "Whispr Topluluğu",
            ownerId: "someone-else",
            roles: [MEMBER_ROLE],
          },
        }),
    });

    assert.equal((await readDetail(fake)).viewerCanManage, true);
  });

  it("yetkisiz üyede viewerCanManage false", async () => {
    const fake = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({
          server: {
            id: "s1",
            members: [{ id: "m1", roles: [{ role: MEMBER_ROLE }] }],
            name: "Whispr Topluluğu",
            ownerId: "someone-else",
            roles: [MEMBER_ROLE],
          },
        }),
    });

    assert.equal((await readDetail(fake)).viewerCanManage, false);
  });

  it("kanal etiketi metin kanalında # taşır, sesli kanalda taşımaz", async () => {
    const text = createFakeDatabase({
      "scheduledEvent.findFirst": () =>
        eventRow({
          channel: {
            id: "c1",
            locked: false,
            name: "tasarım-kritiği",
            permissionOverrides: [],
            type: "TEXT",
          },
        }),
    });
    assert.equal((await readDetail(text)).channelLabel, "#tasarım-kritiği");

    const voice = createFakeDatabase({ "scheduledEvent.findFirst": () => eventRow() });
    assert.equal((await readDetail(voice)).channelLabel, "tasarım-kritiği");
  });
});
