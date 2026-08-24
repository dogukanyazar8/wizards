import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_DAY_BUCKET_KEY,
  EVENT_DURATION_ELAPSED_KEY,
  EVENT_WEEKDAY_KEYS,
  describeEventDuration,
  describeEventRecurrence,
  describeEventStartsIn,
  formatEventClock,
  formatEventDayLabel,
  zonedWeekdayIndex,
} from "@/lib/events/presentation";

const ISTANBUL = "Europe/Istanbul";

describe("events presentation — saat ve gun metni", () => {
  it("saat 24 saatlik yazilir ve izleyicinin saat diliminde okunur", () => {
    const startsAt = new Date("2026-08-26T12:00:00.000Z");

    assert.equal(formatEventClock(startsAt, ISTANBUL, "tr-TR"), "15:00");
    assert.equal(formatEventClock(startsAt, "America/New_York", "tr-TR"), "08:00");
  });

  it("ISO dize de kabul eder; cagri yerleri ikinci bir Date kurmaz", () => {
    assert.equal(formatEventClock("2026-08-26T12:00:00.000Z", ISTANBUL, "tr-TR"), "15:00");
  });

  it("gun etiketi gun ve ay tasir", () => {
    const label = formatEventDayLabel("2026-08-27", ISTANBUL, "tr-TR");

    assert.ok(label.includes("27"));
    assert.ok(label.length > 2);
  });
});

describe("events presentation — sure", () => {
  it("bir saatin altinda dakika yazar", () => {
    assert.deepEqual(describeEventDuration(45), {
      key: "events.duration.minutes",
      params: { minutes: 45 },
    });
  });

  it("tam saatte dakika yazmaz", () => {
    assert.deepEqual(describeEventDuration(180), {
      key: "events.duration.hours",
      params: { hours: 3 },
    });
  });

  it("saat ve dakikayi birlikte tasir", () => {
    assert.deepEqual(describeEventDuration(80), {
      key: "events.duration.hoursMinutes",
      params: { hours: 1, minutes: 20 },
    });
  });

  it("sure yoksa betimleyici de yok — istemci sifir dakika uydurmaz", () => {
    assert.equal(describeEventDuration(null), null);
    assert.equal(describeEventDuration(0), null);
  });

  it("gecmis etkinligin sarmalayici anahtari ayri durur; ic metin ayni sozlukten gelir", () => {
    assert.equal(EVENT_DURATION_ELAPSED_KEY, "events.duration.elapsed");
  });
});

describe("events presentation — baslamasina kalan", () => {
  it("sunucudan gelen dakikayi anahtara baglar", () => {
    assert.deepEqual(describeEventStartsIn(12), {
      key: "events.card.startsIn",
      params: { minutes: 12 },
    });
  });

  it("esik sunucudadir; istemci 60 kuralini tekrar etmez", () => {
    assert.equal(describeEventStartsIn(null), null);
    assert.deepEqual(describeEventStartsIn(90), {
      key: "events.card.startsIn",
      params: { minutes: 90 },
    });
  });
});

describe("events presentation — gun kovasi", () => {
  it("kovayi yalniz anahtara cevirir; kova karari sunucuda verilmistir (tuzak #7)", () => {
    assert.equal(EVENT_DAY_BUCKET_KEY.today, "events.day.today");
    assert.equal(EVENT_DAY_BUCKET_KEY.tomorrow, "events.day.tomorrow");
    assert.equal(EVENT_DAY_BUCKET_KEY.week, "events.day.week");
    assert.equal(EVENT_DAY_BUCKET_KEY.past, "events.day.past");
  });
});

describe("events presentation — tekrar kurali (K6)", () => {
  it("gunluk kural gunluk etiketi verir", () => {
    assert.deepEqual(describeEventRecurrence("FREQ=DAILY", null), {
      key: "events.card.recurrence.daily",
      kind: "daily",
    });
  });

  it("haftalik kural BYDAY gununu tasir", () => {
    assert.deepEqual(describeEventRecurrence("FREQ=WEEKLY;BYDAY=WE", null), {
      key: "events.card.recurrence.weekly",
      kind: "weekly",
      weekdayKey: "events.weekday.wed",
    });
  });

  it("BYDAY yoksa etkinligin kendi gunune duser", () => {
    assert.deepEqual(describeEventRecurrence("RRULE:FREQ=WEEKLY", 4), {
      key: "events.card.recurrence.weekly",
      kind: "weekly",
      weekdayKey: "events.weekday.fri",
    });
  });

  it("gunu bilinmeyen haftalik kural etiket uretmez — yanlis gun yazmaktansa hic yazmaz", () => {
    assert.equal(describeEventRecurrence("FREQ=WEEKLY", null), null);
  });

  it("aylik kural aylik etiketi verir", () => {
    assert.deepEqual(describeEventRecurrence("FREQ=MONTHLY;BYMONTHDAY=3", null), {
      key: "events.card.recurrence.monthly",
      kind: "monthly",
    });
  });

  it("kural yoksa ya da taninmiyorsa etiket de yok", () => {
    assert.equal(describeEventRecurrence(null, 0), null);
    assert.equal(describeEventRecurrence("FREQ=YEARLY", 0), null);
    assert.equal(describeEventRecurrence("", 0), null);
  });

  it("hafta pazartesi baslar; sozluk anahtarlari o sirayla durur", () => {
    assert.deepEqual(EVENT_WEEKDAY_KEYS, [
      "events.weekday.mon",
      "events.weekday.tue",
      "events.weekday.wed",
      "events.weekday.thu",
      "events.weekday.fri",
      "events.weekday.sat",
      "events.weekday.sun",
    ]);
  });

  it("gun indeksi izleyicinin saat diliminde cozulur", () => {
    const lateNight = new Date("2026-08-26T21:30:00.000Z");

    assert.equal(zonedWeekdayIndex(lateNight, ISTANBUL), 3);
    assert.equal(zonedWeekdayIndex(lateNight, "America/New_York"), 2);
  });
});
