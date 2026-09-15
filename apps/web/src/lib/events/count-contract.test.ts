import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileServerEventsListRoute } from "@/app/api/v1/mobile/servers/[serverId]/events/route-logic";
import { listDiscoverEvents, setDiscoverEventInterest } from "@/lib/discover/events-service";
import { getHomeUpcomingEvents } from "@/lib/home/events-service";
import { createFakeDatabase, fakePresenceReader, readJson } from "@/lib/home/home-test-doubles";
import { PermissionBits } from "@/lib/workspace/permissions";
import {
  buildServerScheduledEvent,
  type ServerScheduledEventSource,
} from "@/lib/workspace/scheduled-event-service";

/**
 * Ş3 / tuzak #2 — `interestedCount` **anlam** kayması.
 *
 * K1 sayacın adını değiştirmedi, anlamını daralttı: "ilgili" -> "katılıyor (`GOING`)".
 * Aynı satır tablosu artık iki niyeti birden taşıyor, dolayısıyla sayacı okuyan her yüzey ya
 * `GOING`i ya da `GOING + MAYBE`yi görmek zorunda ve hangisini gördüğü **yazılı** olmalı.
 *
 * Kurgu dört tüketicide de aynı: **3 `GOING` + 2 `MAYBE`**. Bir tüketici sessizce
 * `_count.interests` (5) okumaya dönerse buradaki literal `3` kırılır.
 *
 * Dördüncü tüketici (`lib/discover/events-service.ts`) PROMPT'un üç maddelik listesinde yoktu;
 * `interestedCount` sütununa **yazan** tek yol o olduğu için buraya alındı.
 */

const GOING_USER_IDS = ["going-1", "going-2", "going-3"] as const;
const MAYBE_USER_IDS = ["maybe-1", "maybe-2"] as const;
const GOING_COUNT = GOING_USER_IDS.length;
const MAYBE_COUNT = MAYBE_USER_IDS.length;

/** İzleyici **`MAYBE`** verdi: "yanıt var" ile "katılıyor" ayrımını her testte ölçer. */
const VIEWER_ID = "maybe-1";

const EVENT_ID = "evt-1";
const SERVER_ID = "srv-1";
const STARTS_AT = new Date("2026-09-01T18:00:00.000Z");
const NOW = new Date("2026-08-21T09:00:00.000Z");

function actorRow(userId: string) {
  return {
    avatarUrl: null,
    displayName: userId,
    eventId: EVENT_ID,
    id: userId,
    username: userId,
  };
}

function homeEventRow() {
  return {
    channel: { id: "chn-1", name: "tasarim-kritigi" },
    id: EVENT_ID,
    interestedCount: GOING_COUNT,
    interests: [{ id: `int-${VIEWER_ID}` }],
    name: "Tasarım Kritiği",
    scheduledStartAt: STARTS_AT,
    server: { id: SERVER_ID, name: "Whispr Topluluğu" },
    serverId: SERVER_ID,
  };
}

function scheduledEventSource(): ServerScheduledEventSource {
  return {
    channel: { _count: { voiceStates: 0 }, id: "chn-1", name: "tasarim-kritigi" },
    channelId: "chn-1",
    description: null,
    entityType: "VOICE",
    externalLocation: null,
    id: EVENT_ID,
    interestedCount: GOING_COUNT,
    interests: [{ id: `int-${VIEWER_ID}`, status: "MAYBE" }],
    isPublic: false,
    kind: "VOICE",
    maybeCount: MAYBE_COUNT,
    name: "Tasarım Kritiği",
    recurrenceRule: null,
    scheduledEndAt: null,
    scheduledStartAt: STARTS_AT,
    serverId: SERVER_ID,
    status: "SCHEDULED",
  } as unknown as ServerScheduledEventSource;
}

function discoverEventSource() {
  return {
    channel: { name: "tasarim-kritigi", permissionOverrides: [] },
    entityType: "VOICE" as const,
    externalLocation: null,
    id: EVENT_ID,
    interestedCount: GOING_COUNT,
    name: "Tasarım Kritiği",
    scheduledEndAt: null,
    scheduledStartAt: STARTS_AT,
    server: {
      id: SERVER_ID,
      name: "Whispr Topluluğu",
      ownerId: "owner-1",
      roles: [{ id: "role-1", isDefault: true, permissions: PermissionBits.VIEW_CHANNEL }],
    },
    serverDiscoverable: true,
    serverPublic: true,
  };
}

/**
 * `where.status` okunmazsa `MAYBE` satırları da geri döner; o zaman önizleme beş kişiden
 * seçim yapar ve sayaçla ayrışır. Sahte tablo bu ayrımı ölçebilsin diye süzgeci kendisi
 * uygular.
 */
function interestFindMany(args: unknown) {
  const where = (args as { where?: { status?: string } }).where ?? {};
  const userIds =
    where.status === "GOING" ? [...GOING_USER_IDS] : [...GOING_USER_IDS, ...MAYBE_USER_IDS];

  return userIds.slice(0, 3).map((userId) => ({ user: actorRow(userId) }));
}

describe("etkinlik sayaç sözleşmesi — interestedCount = going (K1)", () => {
  describe("tüketici 1 — lib/home/events-service.ts", () => {
    it("yer seçilmemiş etkinliği Anasayfada gösterir; üyelik ve tarih kapsamını korur", async () => {
      const fake = createFakeDatabase({
        models: {
          scheduledEvent: {
            count: () => 1,
            findMany: () => [{ ...homeEventRow(), channel: null }],
          },
          scheduledEventInterest: { findMany: () => [] },
          serverMember: { findMany: () => [{ serverId: SERVER_ID }] },
        },
      });
      const response = await getHomeUpcomingEvents(VIEWER_ID, 5, {
        database: fake.database,
        now: NOW,
        readPresence: fakePresenceReader(),
      });
      assert.equal(response.next?.id, EVENT_ID);
      assert.equal(response.next?.context, "Whispr Topluluğu");
      const query = fake.calls.find((call) => call.operation === "scheduledEvent.findMany");
      assert.deepEqual((query?.args as { where: unknown }).where, {
        scheduledStartAt: { gte: NOW },
        serverId: { in: [SERVER_ID] },
        status: "SCHEDULED",
      });
    });
    it("Sıradaki kartı 3 yazar (5 değil) ve önizlemeyi GOING ile süzer", async () => {
      const fake = createFakeDatabase({
        models: {
          scheduledEvent: {
            count: () => 1,
            findMany: () => [homeEventRow()],
          },
          scheduledEventInterest: { findMany: interestFindMany },
          serverMember: { findMany: () => [{ serverId: SERVER_ID }] },
        },
      });

      const response = await getHomeUpcomingEvents(VIEWER_ID, 5, {
        database: fake.database,
        now: NOW,
        readPresence: fakePresenceReader(),
      });

      // `MAYBE` verenler **düşer**: kart "3 kişi katılıyor" der, "5 kişi ilgileniyor" demez.
      assert.equal(response.next?.attendeeCount, 3);
      // K12 — "yanıt var mı" ayrı eksendir; `MAYBE` de bir yanıttır.
      assert.equal(response.next?.interested, true);
      assert.deepEqual(
        response.next?.attendees.map((attendee) => attendee.id),
        ["going-1", "going-2", "going-3"],
      );

      const interestQuery = fake.calls.find(
        (call) => call.operation === "scheduledEventInterest.findMany",
      );
      assert.equal((interestQuery?.args as { where?: { status?: string } }).where?.status, "GOING");
    });

    /*
     * Ş10 — ikinci tüketici testi (`listHomeEvents` + toplu `ROW_NUMBER()` katılımcı sorgusu)
     * ölçtüğü yüzeyle birlikte silindi: Faz 6'nın sayfalı Etkinlikler listesi kalktı ve
     * `listTopAttendees` onun tek çağrı yeriydi. K1'in bu dosyadaki kilidi artık
     * `getHomeUpcomingEvents` üzerinden; ham SQL süzgeci diye bir yol kalmadı.
     */
  });

  describe("tüketici 2 — lib/servers/server-public-profile-service.ts", () => {
    it("profil kartı 3 katılım + 2 belki taşır; MAYBE veren izleyici hâlâ yanıt sahibi", () => {
      const event = buildServerScheduledEvent(scheduledEventSource());

      assert.equal(event.interestedCount, 3);
      assert.equal(event.maybeCount, 2);
      assert.equal(event.viewerInterested, true);
      assert.equal(event.rsvpStatus, "MAYBE");
    });
  });

  describe("tüketici 3 — api/v1/mobile/servers/[serverId]/events/*", () => {
    it("eski sözleşme kırılmaz: interestedCount aynı alanda, maybeCount opsiyonel ek", async () => {
      const event = buildServerScheduledEvent(scheduledEventSource());

      const response = await mobileServerEventsListRoute(
        new Request("https://whispr.test/api/v1/mobile/servers/srv-1/events"),
        { params: Promise.resolve({ serverId: SERVER_ID }) },
        {
          authenticate: () => Promise.resolve(VIEWER_ID),
          createEvent: () => Promise.reject(new Error("not used")),
          enforceRateLimit: () => Promise.resolve(),
          listEvents: () => Promise.resolve([event]),
          parseBody: () => Promise.reject(new Error("not used")),
        },
      );

      const body = await readJson(response);
      const [payload] = body.events as Record<string, unknown>[];

      assert.equal(payload?.interestedCount, 3);
      assert.equal(payload?.maybeCount, 2);
      // K12 — `viewerInterested` boolean türetilmiş alan olarak **kalır**.
      assert.equal(payload?.viewerInterested, true);
      assert.equal(payload?.rsvpStatus, "MAYBE");
    });
  });

  describe("tüketici 4 — lib/discover/events-service.ts (sayaca yazan tek yol)", () => {
    it("liste sayacı GOING sayar", async () => {
      const page = await listDiscoverEvents(
        VIEWER_ID,
        {},
        { now: NOW },
        {
          loadEvents: () => Promise.resolve([discoverEventSource()]),
          loadInterestedEventIds: () => Promise.resolve(new Set([EVENT_ID])),
        },
      );

      assert.equal(page.items[0]?.interestedCount, 3);
    });

    it("yazma yolu iki sayacı da eşitler: MAYBE satırı interestedCount'a sızmaz", async () => {
      const written: unknown[] = [];

      const result = await setDiscoverEventInterest(
        VIEWER_ID,
        EVENT_ID,
        true,
        { now: NOW },
        {
          transaction: (run) =>
            run({
              countInterested: () => Promise.resolve(GOING_COUNT),
              countMaybe: () => Promise.resolve(MAYBE_COUNT),
              deleteInterest: () => Promise.resolve(),
              findEligibleEvent: () => Promise.resolve(discoverEventSource()),
              synchronizeInterestedCount: (_eventId, counts) => {
                written.push(counts);
                return Promise.resolve();
              },
              upsertInterest: () => Promise.resolve(),
            }),
        },
      );

      assert.equal(result.interestedCount, 3);
      assert.deepEqual(written, [{ interestedCount: 3, maybeCount: 2 }]);
    });
  });
});
