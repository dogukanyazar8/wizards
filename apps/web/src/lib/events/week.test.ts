import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_WEEK_LENGTH,
  eventWeekDayNumber,
  eventWeekdayKey,
  resolveEventWeek,
  shiftEventWeek,
  weekDays,
  weekMonthLabel,
  weekStartOf,
} from "@/lib/events/week";

/**
 * Ş5 — hafta şeridinin **saf** hesabı.
 *
 * Modül `t()` çağırmaz ve `Date.now()` okumaz: şimdiki zaman ve dil girdi olarak gelir, çünkü
 * ikisi de görüntüleyene bağlı ve bir bileşenin içinde hesaplanan zaman testte dondurulamaz.
 */

describe("weekStartOf", () => {
  it("izleyicinin saat diliminde haftanın pazartesisini verir", () => {
    // 26 Ağustos 2026 çarşamba; haftanın pazartesisi 24 Ağustos.
    assert.equal(weekStartOf("2026-08-26T09:00:00.000Z", "Europe/Istanbul"), "2026-08-24");
  });

  it("gece yarısı sınırında bölge kararı değiştirir (tuzak #7)", () => {
    // 30 Ağustos 2026 pazar 21:30 UTC. Istanbul'da 31 Ağustos pazartesi (yeni hafta),
    // New York'ta hâlâ 30 Ağustos pazar (eski hafta).
    const instant = "2026-08-30T21:30:00.000Z";

    assert.equal(weekStartOf(instant, "Europe/Istanbul"), "2026-08-31");
    assert.equal(weekStartOf(instant, "America/New_York"), "2026-08-24");
  });

  it("pazar kendi haftasına düşer, bir sonrakine değil", () => {
    assert.equal(weekStartOf("2026-08-30T12:00:00.000Z", "UTC"), "2026-08-24");
  });

  it("yıl sınırını geçer", () => {
    assert.equal(weekStartOf("2027-01-01T12:00:00.000Z", "UTC"), "2026-12-28");
  });

  it("Date de kabul eder", () => {
    assert.equal(weekStartOf(new Date("2026-08-26T09:00:00.000Z"), "UTC"), "2026-08-24");
  });
});

describe("weekDays", () => {
  it("pazartesiden pazara yedi takvim günü verir", () => {
    assert.deepEqual(weekDays("2026-08-24"), [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("her zaman yedi kutu üretir", () => {
    assert.equal(weekDays("2026-12-28").length, EVENT_WEEK_LENGTH);
  });

  it("ay ve yıl sınırını geçer", () => {
    assert.deepEqual(weekDays("2026-12-28").slice(3), [
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("pazartesi olmayan bir gün verilirse haftasına yuvarlanır", () => {
    assert.equal(weekDays("2026-08-27")[0], "2026-08-24");
  });
});

describe("shiftEventWeek", () => {
  /** K9 — ok bir **hafta** adımlar; PROMPT'un "ay" kriteri `SPEC_DEVIATIONS` #1'de düştü. */
  it("bir hafta geri ve ileri gider", () => {
    assert.equal(shiftEventWeek("2026-08-24", -1), "2026-08-17");
    assert.equal(shiftEventWeek("2026-08-24", 1), "2026-08-31");
  });

  it("ay sınırını hafta adımıyla geçer, aya yuvarlamaz", () => {
    assert.equal(shiftEventWeek("2026-08-31", 1), "2026-09-07");
  });

  it("yaz saati geçişinde de tam yedi gün adımlar", () => {
    // 25 Ekim 2026 Avrupa'da saat geri alınıyor; UTC hesabı bundan etkilenmemeli.
    assert.equal(shiftEventWeek("2026-10-19", 1), "2026-10-26");
  });
});

describe("eventWeekdayKey", () => {
  it("her günü kendi sözlük anahtarına çevirir", () => {
    assert.equal(eventWeekdayKey("2026-08-24"), "events.week.dow.mon");
    assert.equal(eventWeekdayKey("2026-08-27"), "events.week.dow.thu");
    assert.equal(eventWeekdayKey("2026-08-30"), "events.week.dow.sun");
  });
});

describe("eventWeekDayNumber", () => {
  it("takvim gününün numarasını verir", () => {
    assert.equal(eventWeekDayNumber("2026-08-24"), 24);
    assert.equal(eventWeekDayNumber("2026-09-01"), 1);
  });
});

describe("weekMonthLabel", () => {
  it("tek ayda ay ve yılı yazar", () => {
    const label = weekMonthLabel(weekDays("2026-08-24"), "tr");

    assert.equal(label.kind, "single");
    assert.equal(label.kind === "single" ? label.text : null, "Ağustos 2026");
  });

  it("ay sınırında iki ayı da yazar (Ağu – Eyl 2026)", () => {
    const label = weekMonthLabel(weekDays("2026-08-31"), "tr");

    assert.equal(label.kind, "span");
    assert.deepEqual(
      label.kind === "span" ? { from: label.from, to: label.to, year: label.year } : null,
      { from: "Ağu", to: "Eyl", year: "2026" },
    );
  });

  it("yıl sınırında yılı da başa taşır", () => {
    const label = weekMonthLabel(weekDays("2026-12-28"), "tr");

    assert.equal(label.kind, "span");
    assert.deepEqual(
      label.kind === "span" ? { from: label.from, to: label.to, year: label.year } : null,
      { from: "Ara 2026", to: "Oca", year: "2027" },
    );
  });

  it("İngilizcede aynı hesabı İngilizce yazar", () => {
    const label = weekMonthLabel(weekDays("2026-08-24"), "en");

    assert.equal(label.kind === "single" ? label.text : null, "August 2026");
  });

  it("boş gün listesinde patlamaz", () => {
    assert.equal(weekMonthLabel([], "tr").kind, "single");
  });
});

describe("resolveEventWeek", () => {
  /**
   * Şerit sunucu yanıtı gelmeden de yedi kutu çizer: kutuların **yokluğu** ile "bu hafta hiç
   * etkinlik yok" aynı şey değil ve yükleme sırasında şeridin kaybolması yerleşimi zıplatır.
   */
  it("sunucu yanıtı yokken yedi boş kutu üretir", () => {
    const days = resolveEventWeek("2026-08-24", [], "2026-08-26");

    assert.equal(days.length, EVENT_WEEK_LENGTH);
    assert.deepEqual(
      days.map((day) => day.count),
      [0, 0, 0, 0, 0, 0, 0],
    );
    assert.deepEqual(
      days.map((day) => day.isToday),
      [false, false, true, false, false, false, false],
    );
  });

  it("sunucu yanıtını gün gün eşleştirir", () => {
    const days = resolveEventWeek(
      "2026-08-24",
      [
        { count: 1, date: "2026-08-24", isToday: false, kinds: ["meeting"] },
        {
          count: 4,
          date: "2026-08-26",
          isToday: true,
          kinds: ["live", "voice", "meeting", "game"],
        },
      ],
      "2026-08-26",
    );

    assert.deepEqual(days[0], {
      count: 1,
      date: "2026-08-24",
      isToday: false,
      kinds: ["meeting"],
    });
    assert.equal(days[2]?.count, 4);
    assert.deepEqual(days[2]?.kinds, ["live", "voice", "meeting", "game"]);
    assert.equal(days[1]?.count, 0);
  });

  /** Sunucunun `isToday`i otoritedir: kova kararı orada verilir, burada tekrar edilmez. */
  it("sunucunun isToday değeri istemcinin tahminini ezer", () => {
    const days = resolveEventWeek(
      "2026-08-24",
      [{ count: 0, date: "2026-08-25", isToday: true, kinds: [] }],
      "2026-08-26",
    );

    assert.equal(days[1]?.isToday, true);
    assert.equal(days[2]?.isToday, false);
  });

  it("başka bir haftanın günlerini içeri almaz", () => {
    const days = resolveEventWeek(
      "2026-08-24",
      [{ count: 9, date: "2026-09-14", isToday: false, kinds: ["game"] }],
      "2026-08-26",
    );

    assert.deepEqual(
      days.map((day) => day.count),
      [0, 0, 0, 0, 0, 0, 0],
    );
  });

  it("nokta satırını en çok dört türle sınırlar", () => {
    const days = resolveEventWeek(
      "2026-08-24",
      [
        {
          count: 6,
          date: "2026-08-24",
          isToday: false,
          kinds: ["live", "voice", "meeting", "game"],
        },
      ],
      "2026-08-26",
    );

    assert.ok((days[0]?.kinds.length ?? 0) <= 4);
  });
});
