import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENTS_ATTENDEE_PREVIEW_LIMIT,
  EVENTS_PAST_WINDOW_DAYS,
  addZonedDays,
  buildEventsAttendeePreviewQuery,
  buildEventsCountsQuery,
  buildEventsPageQuery,
  buildEventsUnion,
  buildEventsWeekQuery,
  decodeEventsCursor,
  encodeEventsCursor,
  resolveEventsOrderDirection,
  resolveEventsTimeRange,
  selectEventsBranches,
  toEventsSearchPattern,
  zonedCalendarDate,
  zonedDayStart,
  type EventsQueryScope,
} from "@/lib/events/events-query";
import { sqlText } from "@/lib/home/home-test-doubles";

/**
 * Sorgu **metni** üzerinden test ediliyor: test edilen şey sonuç değil kapsam. Bir dalın hiç
 * kurulmamış olmasıyla kurulup sonucunun elenmesi aynı listeyi verir, ama biri O(sayfa),
 * diğeri O(izleyicinin bütün sunucuları).
 */

const NOW = new Date("2026-08-26T09:00:00.000Z");
const ISTANBUL = "Europe/Istanbul";

function scope(overrides: Partial<EventsQueryScope> = {}): EventsQueryScope {
  return {
    mine: null,
    now: NOW,
    query: null,
    serverId: null,
    tab: "all",
    time: null,
    timeZone: ISTANBUL,
    userId: "u1",
    viewerServerIds: ["s1", "s2"],
    weekStart: null,
    ...overrides,
  };
}

function sql(value: unknown): string {
  return sqlText(value);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("events query — dal secimi", () => {
  it("uyelik ve herkese acik dallarini birlikte kurar", () => {
    assert.deepEqual(selectEventsBranches(scope()), ["member", "public"]);
  });

  it("hic sunucusu olmayan izleyicide uyelik dali kurulmaz — IN () gecerli SQL degil", () => {
    assert.deepEqual(selectEventsBranches(scope({ viewerServerIds: [] })), ["public"]);
  });

  it("uye olunmayan bir sunucu suzgeci seciliyken uyelik dali kurulmaz", () => {
    assert.deepEqual(selectEventsBranches(scope({ serverId: "s9" })), ["public"]);
  });

  it("uye olunan sunucu suzgecinde iki dal da kalir", () => {
    assert.deepEqual(selectEventsBranches(scope({ serverId: "s1" })), ["member", "public"]);
  });

  it("herkese acik dal her zaman kurulur; liste hicbir durumda bos sorguya dusmez", () => {
    assert.ok(selectEventsBranches(scope({ serverId: "s9", viewerServerIds: [] })).length > 0);
  });
});

describe("events query — birlesim (tuzak #6)", () => {
  it("iki dali UNION ile birlestirir, UNION ALL ile degil", () => {
    const text = sql(buildEventsUnion(scope()));

    assert.ok(text.includes(" UNION "));
    assert.ok(!text.includes("UNION ALL"));
  });

  it("viewerIsMember iki dalda da ayni ifadeden gelir — sabit yazilsa UNION tekillestiremezdi", () => {
    const text = sql(buildEventsUnion(scope()));

    assert.ok(!text.includes('TRUE AS "viewerIsMember"'));
    assert.ok(!text.includes('FALSE AS "viewerIsMember"'));
    assert.equal(occurrences(text, 'AS "viewerIsMember"'), 2);
  });

  it("uyelik dali sunucu kimligi listesinden, herkese acik dal isPublic bayragindan okur", () => {
    const text = sql(buildEventsUnion(scope()));

    assert.ok(text.includes('e."serverId" IN ('));
    assert.ok(text.includes('e."isPublic" = TRUE'));
  });

  it("izleyicinin yaniti ve hatirlatmasi ayni gidis-donuste gelir", () => {
    const text = sql(buildEventsUnion(scope()));

    assert.ok(text.includes('LEFT JOIN "ScheduledEventInterest" i'));
    assert.ok(text.includes('LEFT JOIN "ScheduledEventReminder"'));
  });
});

describe("events query — sekme ve suzgecler", () => {
  it("varsayilan durum kumesi SCHEDULED + ACTIVE; iptal edilen etkinlik hic listelenmez", () => {
    const text = sql(buildEventsUnion(scope()));

    assert.ok(text.includes("'SCHEDULED'"));
    assert.ok(text.includes("'ACTIVE'"));
    assert.ok(!text.includes("'CANCELLED'"));
  });

  it("Yaklasan sekmesi canli olani dusurur", () => {
    const text = sql(buildEventsUnion(scope({ tab: "upcoming" })));

    assert.ok(text.includes(`e."status" = 'SCHEDULED'`));
  });

  it("Canli sekmesi yalniz ACTIVE okur", () => {
    const text = sql(buildEventsUnion(scope({ tab: "live" })));

    assert.ok(text.includes(`e."status" = 'ACTIVE'`));
  });

  it("Katilacagim sekmesi izleyicinin GOING yanitini arar", () => {
    const text = sql(buildEventsUnion(scope({ tab: "going" })));

    assert.ok(text.includes(`i."status" = 'GOING'`));
  });

  it("mine=host sahiplik suzgecidir, yanit suzgeci degil", () => {
    const text = sql(buildEventsUnion(scope({ mine: "host" })));

    assert.ok(text.includes('e."creatorId" ='));
  });

  it("mine=maybe izleyicinin MAYBE yanitini arar", () => {
    const text = sql(buildEventsUnion(scope({ mine: "maybe" })));

    assert.ok(text.includes(`i."status" = 'MAYBE'`));
  });

  it("arama sunucudadir ve baslik, sunucu adi ve kanal adi uzerinde kosar", () => {
    const text = sql(buildEventsUnion(scope({ query: "oyun" })));

    assert.ok(text.includes('e."name" ILIKE'));
    assert.ok(text.includes('s."name" ILIKE'));
    assert.ok(text.includes(`COALESCE(c."name", '') ILIKE`));
  });

  it("gecmis dali COMPLETED'i da alir, simdiden geriye 30 gunle sinirlidir", () => {
    const text = sql(buildEventsUnion(scope({ time: "past" })));

    assert.ok(text.includes("'COMPLETED'"));
    assert.equal(EVENTS_PAST_WINDOW_DAYS, 30);
  });

  it("zaman penceresi UTC ani olarak iner; AT TIME ZONE yazilsaydi indeks kullanilamazdi", () => {
    const today = resolveEventsTimeRange(scope({ time: "today" }));
    const week = resolveEventsTimeRange(scope({ time: "week", weekStart: "2026-08-24" }));

    // Istanbul'da 26 Agustos gece yarisi = 25 Agustos 21:00 UTC.
    assert.equal(today.from?.toISOString(), "2026-08-25T21:00:00.000Z");
    assert.equal(today.to?.toISOString(), "2026-08-26T21:00:00.000Z");
    assert.equal(week.from?.toISOString(), "2026-08-23T21:00:00.000Z");
    assert.equal(week.to?.toISOString(), "2026-08-30T21:00:00.000Z");
  });

  it("ay penceresi gorunen haftanin ayindan turer, iceride bulunulan aydan degil", () => {
    // 31 Agustos pazartesi: haftasi eylule tasiyor ama ay suzgeci Agustos'u secer.
    const august = resolveEventsTimeRange(scope({ time: "month", weekStart: "2026-08-31" }));

    assert.equal(august.from?.toISOString(), "2026-07-31T21:00:00.000Z");
    assert.equal(august.to?.toISOString(), "2026-08-31T21:00:00.000Z");
  });

  it("yil sinirinda ay penceresi tasar", () => {
    const december = resolveEventsTimeRange(scope({ time: "month", weekStart: "2026-12-28" }));

    // Turkiye 2016'dan beri kalici UTC+3; kis aylarinda da fark 3 saat.
    assert.equal(december.from?.toISOString(), "2026-11-30T21:00:00.000Z");
    assert.equal(december.to?.toISOString(), "2026-12-31T21:00:00.000Z");
  });

  it("yaz saati uygulayan bir bolgede gun basi kaymaz", () => {
    // New York: 26 Agustos EDT (UTC-4), 26 Ocak EST (UTC-5).
    const summer = resolveEventsTimeRange(scope({ time: "today", timeZone: "America/New_York" }));
    const winter = resolveEventsTimeRange(
      scope({
        now: new Date("2027-01-26T14:00:00.000Z"),
        time: "today",
        timeZone: "America/New_York",
      }),
    );

    assert.equal(summer.from?.toISOString(), "2026-08-26T04:00:00.000Z");
    assert.equal(winter.from?.toISOString(), "2027-01-26T05:00:00.000Z");
  });

  it("gecmis penceresi simdiden geriye 30 gun, ustu simdi", () => {
    const past = resolveEventsTimeRange(scope({ time: "past" }));

    assert.equal(past.to?.toISOString(), NOW.toISOString());
    assert.equal(
      past.from?.toISOString(),
      new Date(NOW.getTime() - EVENTS_PAST_WINDOW_DAYS * 86_400_000).toISOString(),
    );
  });

  it("suzgec yokken pencere de yok; Tumu sekmesi arsiv disindaki her seyi gosterir", () => {
    assert.deepEqual(resolveEventsTimeRange(scope()), { from: null, to: null });
  });

  it("gecmis dalinda sira tersine doner", () => {
    assert.equal(resolveEventsOrderDirection("past"), "desc");
    assert.equal(resolveEventsOrderDirection(null), "asc");
    assert.equal(resolveEventsOrderDirection("today"), "asc");
  });

  it("sayfa sorgusu imlec yonune gore siralar ve limit+1 okur", () => {
    const ascending = sql(buildEventsPageQuery(scope(), null, 24));
    const descending = sql(buildEventsPageQuery(scope({ time: "past" }), null, 24));

    assert.ok(ascending.includes('ORDER BY "startsAt" ASC, "id" ASC'));
    assert.ok(descending.includes('ORDER BY "startsAt" DESC, "id" DESC'));
    assert.ok(ascending.includes("LIMIT"));
  });
});

describe("events query — sayaclar filtresizdir (tuzak #3)", () => {
  it("kaynak, katilim ve arama suzgecleri sayac sorgusuna girmez", () => {
    const filtered = scope({ mine: "going", query: "oyun", serverId: "s1", tab: "live" });
    const text = sql(buildEventsCountsQuery(filtered));

    assert.ok(!text.includes("ILIKE"));
    assert.ok(!text.includes('e."creatorId" ='));
    assert.ok(!text.includes(`e."status" = 'ACTIVE'`));
    assert.ok(!text.includes('e."serverId" = '));
  });

  it("dort sayiyi, canli bayragini ve siradaki saati tek gecişte uretir", () => {
    const text = sql(buildEventsCountsQuery(scope()));

    assert.ok(text.includes('AS "all"'));
    assert.ok(text.includes('AS "upcoming"'));
    assert.ok(text.includes('AS "live"'));
    assert.ok(text.includes('AS "going"'));
    assert.ok(text.includes('AS "nextStartsAt"'));
    assert.ok(text.includes("FILTER (WHERE"));
  });

  it("sayac sorgusu da UNION kullanir; uye olunan herkese acik etkinlik iki kez sayilmaz", () => {
    const text = sql(buildEventsCountsQuery(scope()));

    assert.ok(text.includes(" UNION "));
    assert.ok(!text.includes("UNION ALL"));
  });
});

describe("events query — hafta noktalari", () => {
  const range = {
    from: new Date("2026-08-23T21:00:00.000Z"),
    to: new Date("2026-08-30T21:00:00.000Z"),
  };

  it("liste suzgeclerinden bagimsizdir — serit bir gezinme aracidir, sonucun ozeti degil", () => {
    const filtered = scope({ mine: "host", query: "oyun", serverId: "s1", tab: "live" });
    const text = sql(buildEventsWeekQuery(filtered, range));

    assert.ok(!text.includes("ILIKE"));
    assert.ok(!text.includes('e."creatorId" ='));
    assert.ok(!text.includes(`e."status" = 'ACTIVE'`));
  });

  it("gunu izleyicinin saat diliminde gruplar ve turu ilk baslangicina gore siralar", () => {
    const text = sql(buildEventsWeekQuery(scope(), range));

    assert.ok(text.includes("AT TIME ZONE"));
    assert.ok(text.includes('AS "firstStartAt"'));
    assert.ok(text.includes("GROUP BY"));
  });
});

describe("events query — imlec", () => {
  it("yonu de tasir: ayni etkinlik gecmis sayfasinda ileri, gelecek sayfasinda geri gitmez", () => {
    const cursor = {
      direction: "desc" as const,
      id: "ev-1",
      startAt: new Date("2026-08-20T12:00:00.000Z"),
    };

    assert.deepEqual(decodeEventsCursor(encodeEventsCursor(cursor)), cursor);
  });

  it("bozuk imlec atmaz, yok sayilir", () => {
    assert.equal(decodeEventsCursor("zzzz"), null);
    assert.equal(decodeEventsCursor(undefined), null);
    assert.equal(decodeEventsCursor(""), null);
  });

  it("imlec dalin icinde uygulanir ki indeks taramasi bozulmasin", () => {
    const cursor = {
      direction: "asc" as const,
      id: "ev-1",
      startAt: new Date("2026-08-20T12:00:00.000Z"),
    };
    const text = sql(buildEventsUnion(scope(), cursor));

    assert.equal(occurrences(text, 'e."scheduledStartAt", e."id"'), 2);
  });
});

describe("events query — arama kalibi", () => {
  it("% ve _ kullanici metninde veridir; kacirilmazsa arama sessizce filtresiz kalir", () => {
    assert.equal(toEventsSearchPattern("%"), "%\\%%");
    assert.equal(toEventsSearchPattern("a_b"), "%a\\_b%");
    assert.equal(toEventsSearchPattern("oyun"), "%oyun%");
  });
});

describe("events query — saat dilimi yardimcilari (tuzak #7)", () => {
  it("gun baslangici izleyicinin saat diliminde cozulur", () => {
    assert.equal(zonedDayStart("2026-08-26", ISTANBUL).toISOString(), "2026-08-25T21:00:00.000Z");
    assert.equal(
      zonedDayStart("2026-08-26", "America/New_York").toISOString(),
      "2026-08-26T04:00:00.000Z",
    );
  });

  it("takvim gunu izleyicinin saat diliminde okunur", () => {
    const lateNight = new Date("2026-08-26T21:30:00.000Z");

    assert.equal(zonedCalendarDate(lateNight, ISTANBUL), "2026-08-27");
    assert.equal(zonedCalendarDate(lateNight, "America/New_York"), "2026-08-26");
  });

  it("gun ekleme takvim gunu uzerinden yapilir, 24 saat eklenerek degil", () => {
    assert.equal(addZonedDays("2026-08-30", 7), "2026-09-06");
    assert.equal(addZonedDays("2026-12-28", 7), "2027-01-04");
  });
});

describe("events query — katilimci onizlemesi", () => {
  it("etkinlik basina en cok uc GOING satiri, katilma sirasiyla", () => {
    const text = sql(buildEventsAttendeePreviewQuery(["ev-1", "ev-2"]));

    assert.equal(EVENTS_ATTENDEE_PREVIEW_LIMIT, 3);
    assert.ok(text.includes("ROW_NUMBER"));
    assert.ok(text.includes(`i."status" = 'GOING'`));
    assert.ok(text.includes('i."createdAt" ASC'));
  });

  it("kimlik yoksa sorgu hic kurulmaz", () => {
    assert.equal(buildEventsAttendeePreviewQuery([]), null);
  });
});
