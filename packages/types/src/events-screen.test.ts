import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CreateEventInputSchema,
  EVENTS_UI_INITIAL_STATE,
  EVENT_ATTENDEE_ROLE_TONE,
  EVENT_KIND_GLYPH,
  EVENT_KIND_TONE,
  EventAttendeeRoleSchema,
  EventCardSizeSchema,
  EventCountsSchema,
  EventDayBucketSchema,
  EventDetailSchema,
  EventKindSchema,
  EventMineFilterSchema,
  EventReminderMinutesSchema,
  EventRsvpSchema,
  EventTabSchema,
  EventTimeFilterSchema,
  EventWeekDaySchema,
  EventsListResponseSchema,
  EventsQuerySchema,
  SetEventReminderSchema,
  SetEventRsvpSchema,
  WhisprEventSchema,
  eventsUiReducer,
  type EventsUiState,
  type WhisprEvent,
} from "./events-screen";

const event: WhisprEvent = {
  id: "e1",
  title: "Tasarım Kritiği",
  kind: "voice",
  serverId: "s-1",
  serverName: "Whispr Topluluğu",
  channelId: "c-1",
  channelLabel: "#tasarım-kritiği",
  isPublic: false,
  viewerIsMember: true,
  startsAt: "2026-08-27T12:00:00.000Z",
  endsAt: "2026-08-27T12:45:00.000Z",
  durationMinutes: 45,
  dayBucket: "today",
  host: { id: "u-1", name: "Selin Aksoy", initials: "SA", avatarUrl: null },
  goingCount: 8,
  maybeCount: 2,
  attendeePreview: [
    { id: "u-2", name: "Mert Kaya", initials: "MK", avatarUrl: null, role: "going" },
    { id: "u-3", name: "Zeynep Arı", initials: "ZA", avatarUrl: null, role: "going" },
    { id: "u-4", name: "Can Öztürk", initials: "CÖ", avatarUrl: null, role: "maybe" },
  ],
  rsvp: null,
  isLive: false,
  startsInMinutes: 12,
  recurrenceRule: null,
  description: "Kart yoğunluğu kararını ve ölçek adımlarını ele alacağız.",
  reminder: { enabled: true, minutesBefore: 10 },
  viewerCanManage: false,
};

describe("events-screen — enumlar", () => {
  it("altı sunum türünü sayar (K2)", () => {
    assert.deepEqual(EventKindSchema.options, [
      "voice",
      "meeting",
      "game",
      "live",
      "community",
      "workshop",
    ]);
  });

  it("RSVP iki değer taşır; yanıtsızlık `null` ile anlatılır (K1)", () => {
    assert.deepEqual(EventRsvpSchema.options, ["going", "maybe"]);
  });

  it("sekme, zaman, katılım, kova, rol ve kart boyutu eksenlerini sabitler", () => {
    assert.deepEqual(EventTabSchema.options, ["all", "upcoming", "live", "going"]);
    assert.deepEqual(EventTimeFilterSchema.options, ["today", "week", "month", "past"]);
    assert.deepEqual(EventMineFilterSchema.options, ["going", "maybe", "host"]);
    assert.deepEqual(EventDayBucketSchema.options, ["today", "tomorrow", "week", "past"]);
    assert.deepEqual(EventAttendeeRoleSchema.options, ["host", "going", "maybe", "listening"]);
    assert.deepEqual(EventCardSizeSchema.options, ["medium", "large"]);
  });

  it("hatırlatma yalnız beş dakikayı kabul eder (K5)", () => {
    for (const minutes of [5, 10, 15, 30, 60]) {
      assert.equal(EventReminderMinutesSchema.safeParse(minutes).success, true);
    }

    assert.equal(EventReminderMinutesSchema.safeParse(7).success, false);
    assert.equal(EventReminderMinutesSchema.safeParse(0).success, false);
  });
});

describe("events-screen — ton ve glif haritaları renk taşımaz", () => {
  const maps = { EVENT_KIND_TONE, EVENT_ATTENDEE_ROLE_TONE };

  for (const [name, map] of Object.entries(maps)) {
    it(`${name} yalnız token adı taşır`, () => {
      for (const value of Object.values(map)) {
        assert.ok(!/#|hsl\(|rgb\(/u.test(value), `${name} içinde renk var: ${value}`);
        assert.match(value, /^--[a-z-]+$/u);
      }
    });
  }

  it("her tür bir tona ve bir glife bağlıdır", () => {
    assert.deepEqual(Object.keys(EVENT_KIND_TONE), [...EventKindSchema.options]);
    assert.deepEqual(Object.keys(EVENT_KIND_GLYPH), [...EventKindSchema.options]);
    assert.deepEqual(Object.values(EVENT_KIND_GLYPH), ["S", "T", "O", "C", "K", "A"]);
  });

  it("PLAN §8 ton tablosunu birebir taşır", () => {
    assert.deepEqual(EVENT_KIND_TONE, {
      voice: "--primary",
      meeting: "--info",
      game: "--warning",
      live: "--danger",
      community: "--success",
      workshop: "--info",
    });
    assert.deepEqual(EVENT_ATTENDEE_ROLE_TONE, {
      host: "--primary",
      going: "--success",
      maybe: "--warning",
      listening: "--success",
    });
  });
});

describe("events-screen — WhisprEvent", () => {
  it("örnek etkinliği kabul eder", () => {
    assert.equal(WhisprEventSchema.safeParse(event).success, true);
  });

  it("görüntülenecek metin alanı taşımaz (§3.1 sapması)", () => {
    const forbidden = Object.keys(WhisprEventSchema.shape).filter((key) => /Label$/u.test(key));

    // `channelLabel` tek istisnadır: sunucudan gelen kanal başlığıdır, i18n cümlesi değil.
    assert.deepEqual(forbidden, ["channelLabel"]);
    assert.ok(!("durationLabel" in WhisprEventSchema.shape));
    assert.ok(!("startsInLabel" in WhisprEventSchema.shape));
    assert.ok(!("recurrenceLabel" in WhisprEventSchema.shape));
    assert.ok(!("dayLabel" in WhisprEventSchema.shape));
  });

  it("sayı ve enum gönderir: süre dakika, kova enum, kalan dakika sayı", () => {
    assert.equal(WhisprEventSchema.parse(event).durationMinutes, 45);
    assert.equal(WhisprEventSchema.parse(event).dayBucket, "today");
    assert.equal(WhisprEventSchema.parse(event).startsInMinutes, 12);
  });

  it("attendeePreview dört eleman kabul etmez", () => {
    const four = {
      ...event,
      attendeePreview: [
        ...event.attendeePreview,
        { id: "u-5", name: "Emre Şahin", initials: "ES", avatarUrl: null, role: "listening" },
      ],
    };

    assert.equal(WhisprEventSchema.safeParse(four).success, false);
  });

  it("goingCount önizleme uzunluğundan türetilmez", () => {
    const parsed = WhisprEventSchema.parse({ ...event, goingCount: 128 });

    assert.equal(parsed.goingCount, 128);
    assert.equal(parsed.attendeePreview.length, 3);
  });

  it("startsInMinutes eşiği aşan etkinlikte null olabilir", () => {
    assert.equal(
      WhisprEventSchema.parse({ ...event, startsInMinutes: null }).startsInMinutes,
      null,
    );
  });

  it("harici etkinlikte channelId null olur", () => {
    assert.equal(
      WhisprEventSchema.parse({ ...event, channelId: null, channelLabel: "Topluluk sahnesi" })
        .channelId,
      null,
    );
  });
});

describe("events-screen — sayaçlar ve hafta", () => {
  it("sayaç nesnesi dört sekmeyi, canlı bayrağını ve sonraki saati taşır", () => {
    const counts = EventCountsSchema.parse({
      all: 8,
      upcoming: 7,
      live: 1,
      going: 2,
      liveNow: true,
      nextStartsAt: "2026-08-27T12:00:00.000Z",
    });

    assert.equal(counts.liveNow, true);
    assert.equal(counts.nextStartsAt, "2026-08-27T12:00:00.000Z");
  });

  it("hafta günü en çok dört nokta taşır", () => {
    const day = {
      date: "2026-08-27",
      kinds: ["live", "voice", "meeting", "game"],
      isToday: true,
      count: 4,
    };

    assert.equal(EventWeekDaySchema.safeParse(day).success, true);
    assert.equal(
      EventWeekDaySchema.safeParse({ ...day, kinds: [...day.kinds, "community"] }).success,
      false,
    );
  });

  it("hafta günü `YYYY-MM-DD` ister", () => {
    assert.equal(
      EventWeekDaySchema.safeParse({ date: "27.08.2026", kinds: [], isToday: false, count: 0 })
        .success,
      false,
    );
  });
});

describe("events-screen — sorgu ve yanıt", () => {
  it("sorgu yalnız sekmeyi zorunlu tutar", () => {
    assert.equal(EventsQuerySchema.safeParse({ tab: "all" }).success, true);
    assert.equal(EventsQuerySchema.safeParse({}).success, false);
  });

  it("liste yanıtı öğe, imleç, sayaç ve haftayı birlikte taşır", () => {
    const parsed = EventsListResponseSchema.parse({
      items: [event],
      nextCursor: null,
      counts: { all: 1, upcoming: 1, live: 0, going: 0, liveNow: false, nextStartsAt: null },
      week: [{ date: "2026-08-27", kinds: ["voice"], isToday: true, count: 1 }],
    });

    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.week.length, 1);
  });

  it("detay katılımcıları, fazlalık sayısını ve canlı hedefini ekler", () => {
    const detail = EventDetailSchema.parse({
      ...event,
      attendees: event.attendeePreview,
      attendeeMoreCount: 5,
      canJoinLive: false,
      joinHref: null,
    });

    assert.equal(detail.attendeeMoreCount, 5);
    assert.equal(detail.joinHref, null);
  });
});

describe("events-screen — yazma sözleşmeleri", () => {
  const base = {
    kind: "voice" as const,
    title: "Tasarım Kritiği",
    startsAt: "2026-08-27T12:00:00.000Z",
    durationMinutes: 45,
    serverId: "s-1",
    isPublic: false,
  };

  it("kanal ile harici bağlantı birlikte verilemez (K10)", () => {
    assert.equal(
      CreateEventInputSchema.safeParse({
        ...base,
        channelId: "c-1",
        externalLocation: "https://ornek.com/yayin",
      }).success,
      false,
    );
  });

  it("yalnız kanal ya da yalnız harici bağlantı geçer", () => {
    assert.equal(CreateEventInputSchema.safeParse({ ...base, channelId: "c-1" }).success, true);
    assert.equal(
      CreateEventInputSchema.safeParse({ ...base, externalLocation: "https://ornek.com/yayin" })
        .success,
      true,
    );
    assert.equal(CreateEventInputSchema.safeParse(base).success, true);
  });

  it("başlık 1..120 arasıdır", () => {
    assert.equal(CreateEventInputSchema.safeParse({ ...base, title: "" }).success, false);
    assert.equal(
      CreateEventInputSchema.safeParse({ ...base, title: "a".repeat(121) }).success,
      false,
    );
  });

  it("süre segmentin dışında da kabul edilir ama sınırlıdır", () => {
    assert.equal(CreateEventInputSchema.safeParse({ ...base, durationMinutes: 5 }).success, true);
    assert.equal(
      CreateEventInputSchema.safeParse({ ...base, durationMinutes: 1440 }).success,
      true,
    );
    assert.equal(CreateEventInputSchema.safeParse({ ...base, durationMinutes: 4 }).success, false);
    assert.equal(
      CreateEventInputSchema.safeParse({ ...base, durationMinutes: 1441 }).success,
      false,
    );
  });

  it("RSVP hedef durumdur, geçiş değil: `null` yanıtı geri alır", () => {
    assert.deepEqual(SetEventRsvpSchema.parse({ rsvp: null }), { rsvp: null });
    assert.deepEqual(SetEventRsvpSchema.parse({ rsvp: "maybe" }), { rsvp: "maybe" });
    assert.equal(SetEventRsvpSchema.safeParse({ rsvp: "belki" }).success, false);
  });

  it("hatırlatma açık/kapalı ve dakikayı birlikte yazar", () => {
    assert.deepEqual(SetEventReminderSchema.parse({ enabled: true, minutesBefore: 30 }), {
      enabled: true,
      minutesBefore: 30,
    });
    assert.equal(
      SetEventReminderSchema.safeParse({ enabled: true, minutesBefore: 45 }).success,
      false,
    );
  });
});

describe("events-screen — UI indirgeyicisi", () => {
  it("başlangıç durumu her yüzeyi kapalı bırakır", () => {
    assert.deepEqual(EVENTS_UI_INITIAL_STATE, {
      panel: null,
      createOpen: false,
      cursor: null,
      rsvpBanner: null,
    });
  });

  it("panel açmak modalı kapatır", () => {
    const state: EventsUiState = { ...EVENTS_UI_INITIAL_STATE, createOpen: true };
    const next = eventsUiReducer(state, { type: "openPanel", id: "e1" });

    assert.equal(next.panel, "e1");
    assert.equal(next.createOpen, false);
    assert.equal(next.cursor, "e1");
  });

  it("aynı panele tekrar basmak kapatır", () => {
    const open = eventsUiReducer(EVENTS_UI_INITIAL_STATE, { type: "openPanel", id: "e1" });

    assert.equal(eventsUiReducer(open, { type: "openPanel", id: "e1" }).panel, null);
  });

  it("modal açmak paneli kapatır (aynı anda tek yüzey)", () => {
    const withPanel = eventsUiReducer(EVENTS_UI_INITIAL_STATE, { type: "openPanel", id: "e1" });
    const next = eventsUiReducer(withPanel, { type: "openCreate" });

    assert.equal(next.createOpen, true);
    assert.equal(next.panel, null);
  });

  it("closeTransient merdiveni: modal → panel → RSVP şeridi", () => {
    const all: EventsUiState = {
      panel: "e1",
      createOpen: true,
      cursor: "e1",
      rsvpBanner: { eventId: "e1", rsvp: "going" },
    };

    const afterModal = eventsUiReducer(all, { type: "closeTransient" });
    assert.equal(afterModal.createOpen, false);
    assert.equal(afterModal.panel, "e1");
    assert.notEqual(afterModal.rsvpBanner, null);

    const afterPanel = eventsUiReducer(afterModal, { type: "closeTransient" });
    assert.equal(afterPanel.panel, null);
    assert.notEqual(afterPanel.rsvpBanner, null);

    const afterBanner = eventsUiReducer(afterPanel, { type: "closeTransient" });
    assert.equal(afterBanner.rsvpBanner, null);

    assert.deepEqual(eventsUiReducer(afterBanner, { type: "closeTransient" }), afterBanner);
  });

  it("RSVP şeridi yalnız `going` yanıtından doğar ve elle kapanır", () => {
    const shown = eventsUiReducer(EVENTS_UI_INITIAL_STATE, {
      type: "showRsvpBanner",
      eventId: "e1",
      rsvp: "going",
    });

    assert.deepEqual(shown.rsvpBanner, { eventId: "e1", rsvp: "going" });
    assert.equal(eventsUiReducer(shown, { type: "dismissRsvpBanner" }).rsvpBanner, null);
  });

  it("imleç panelden bağımsız yürür", () => {
    const next = eventsUiReducer(EVENTS_UI_INITIAL_STATE, { type: "setCursor", id: "e7" });

    assert.equal(next.cursor, "e7");
    assert.equal(next.panel, null);
  });
});
