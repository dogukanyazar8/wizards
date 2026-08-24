import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventWeekDay } from "@wizards/types";

import { EventWeekStrip } from "@/components/events/event-week-strip";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";
import { EVENTS_DEFAULT_ROUTE_STATE, type EventsRouteState } from "@/lib/events/routes";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş5 — hafta şeridi (SPEC §3.2).
 *
 * Şerit **saf sunum**: sorgu açmaz, `Date.now()` okumaz, kova hesaplamaz. Gün kutuları gerçek
 * bağlantı; filtre adreste duruyor ve `replace` ile yazılıyor (PROMPT §4).
 */

const { weekStrip } = EVENTS_METRICS;

function day(overrides: Partial<EventWeekDay> & { date: string }): EventWeekDay {
  return { count: 0, isToday: false, kinds: [], ...overrides };
}

const WEEK: readonly EventWeekDay[] = [
  day({ count: 1, date: "2026-08-24", kinds: ["meeting"] }),
  day({ count: 2, date: "2026-08-25", kinds: ["voice", "game"] }),
  day({ count: 4, date: "2026-08-26", isToday: true, kinds: ["live", "voice", "meeting", "game"] }),
  day({ count: 1, date: "2026-08-27", kinds: ["community"] }),
  day({ count: 1, date: "2026-08-28", kinds: ["game"] }),
  day({ count: 1, date: "2026-08-29", kinds: ["workshop"] }),
  day({ date: "2026-08-30" }),
];

function renderStrip(
  overrides: Partial<React.ComponentProps<typeof EventWeekStrip>> = {},
  locale: "en" | "tr" = "tr",
) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale} initialMessages={getMessagesForLocale(locale)}>
      <EventWeekStrip
        days={WEEK}
        locale={locale}
        routeState={EVENTS_DEFAULT_ROUTE_STATE}
        todayDate="2026-08-26"
        weekStart="2026-08-24"
        {...overrides}
      />
    </LocaleProvider>,
  );
}

function withRoute(patch: Partial<EventsRouteState>): EventsRouteState {
  return { ...EVENTS_DEFAULT_ROUTE_STATE, ...patch };
}

function countMatches(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0;
}

describe("EventWeekStrip — yedi kutu", () => {
  it("her zaman yedi gün kutusu çizer", () => {
    assert.equal(countMatches(renderStrip(), /data-testid="events-week-day-/gu), 7);
  });

  it("sunucu haftası boşken de yedi kutu kalır", () => {
    assert.equal(countMatches(renderStrip({ days: [] }), /data-testid="events-week-day-/gu), 7);
  });

  it("gün numaralarını takvimden yazar", () => {
    const markup = renderStrip();

    for (const number of [24, 25, 26, 27, 28, 29, 30]) {
      assert.match(markup, new RegExp(`>${number}</span>`, "u"));
    }
  });

  it("gün kısaltmaları sözlükten gelir", () => {
    const markup = renderStrip();

    for (const dow of ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]) {
      assert.ok(markup.includes(dow), `${dow} çizilmemiş`);
    }
  });
});

describe("EventWeekStrip — noktalar", () => {
  it("gün başına en çok dört nokta çizer", () => {
    const markup = renderStrip({
      days: [
        day({
          count: 9,
          date: "2026-08-24",
          kinds: ["live", "voice", "meeting", "game"],
        }),
      ],
    });

    assert.equal(countMatches(markup, /data-testid="events-week-dot"/gu), 4);
  });

  it("noktalar tür tonu token'ından gelir, sabit renkten değil", () => {
    const markup = renderStrip();

    assert.match(markup, /hsl\(var\(--danger\)\)/u);
    assert.doesNotMatch(markup, /#[0-9a-f]{3,6}\b/iu);
  });

  it("nokta satırı ekran okuyucudan gizli; sayı aria-label'da metin olarak var", () => {
    const markup = renderStrip();

    assert.match(markup, /aria-hidden="true"[^>]*data-testid="events-week-dot-row"/u);
    assert.ok(markup.includes("4 etkinlik"), "gün sayısı erişilebilir adda yok");
  });
});

describe("EventWeekStrip — bugün", () => {
  it("bugünü primary zemin ve kenarla vurgular", () => {
    const markup = renderStrip();

    assert.match(
      markup,
      new RegExp(`hsl\\(var\\(--primary\\)/${weekStrip.todaySurfaceAlpha}\\)`, "u"),
    );
    assert.match(
      markup,
      new RegExp(`hsl\\(var\\(--primary\\)/${weekStrip.todayBorderAlpha}\\)`, "u"),
    );
    /*
     * S10 — metin ham `--primary` **degil**, `--primary-readable`. Ham ton kendi %14'luk
     * zemini ustunde 2,52:1 kaliyordu (axe `color-contrast`, serious). Ton ayni aile;
     * degisen tek sey okunurluk.
     */
    assert.equal(countMatches(markup, /color:var\(--primary-readable\)/gu), 2);
    assert.doesNotMatch(markup, /color:hsl\(var\(--primary\)\)/u);
  });

  it("bugünü aria-current ile de işaretler", () => {
    assert.equal(countMatches(renderStrip(), /aria-current="date"/gu), 1);
  });

  it("sunucu haftası yokken bugünü todayDate'ten bulur", () => {
    assert.equal(countMatches(renderStrip({ days: [] }), /aria-current="date"/gu), 1);
  });
});

describe("EventWeekStrip — hafta okları (K9)", () => {
  it("‹ bir hafta geri götürür", () => {
    assert.match(renderStrip(), /href="\/events\?week=2026-08-17"/u);
  });

  it("› bir hafta ileri götürür", () => {
    assert.match(renderStrip(), /href="\/events\?week=2026-08-31"/u);
  });

  it("ok adımı aya yuvarlamaz", () => {
    const markup = renderStrip({ weekStart: "2026-08-31" });

    assert.match(markup, /href="\/events\?week=2026-09-07"/u);
    assert.doesNotMatch(markup, /week=2026-09-01/u);
  });

  it("oklar diğer filtreleri korur", () => {
    const markup = renderStrip({
      routeState: withRoute({ mine: "going", tab: "live" }),
    });

    assert.match(markup, /href="\/events\?tab=live&amp;mine=going&amp;week=2026-08-17"/u);
  });
});

describe("EventWeekStrip — ay etiketi", () => {
  it("tek ayda ay ve yılı yazar", () => {
    assert.ok(renderStrip().includes("Ağustos 2026"));
  });

  it("ay sınırında iki ayı da yazar", () => {
    assert.ok(renderStrip({ days: [], weekStart: "2026-08-31" }).includes("Ağu – Eyl 2026"));
  });

  it("İngilizcede İngilizce yazar", () => {
    assert.ok(renderStrip({ days: [] }, "en").includes("August 2026"));
  });
});

describe("EventWeekStrip — gün tıklaması", () => {
  it("bugüne tıklamak time=today yazar", () => {
    assert.match(renderStrip(), /href="\/events\?time=today"/u);
  });

  it("bugüne ikinci tık filtreyi kaldırır", () => {
    const markup = renderStrip({ routeState: withRoute({ time: "today" }) });

    // Seçili bugünün bağlantısı artık filtresiz adrese gidiyor.
    assert.match(markup, /data-testid="events-week-day-2026-08-26"[^>]*href="\/events"/u);
  });

  /**
   * Kayda geçen sapma: `EventTimeFilter` gün başına bir değer taşımıyor (Dalga 0'da donduruldu)
   * ve referans HTML'in `go` işleyicisi bugün dışındaki günde `time: null` yazıyor. Otorite
   * HTML olduğu için bugün dışındaki kutu zaman filtresini **kaldırır**.
   */
  it("bugün olmayan gün zaman filtresini kaldırır (HTML otoritesi)", () => {
    const markup = renderStrip({ routeState: withRoute({ time: "week" }) });

    assert.match(markup, /data-testid="events-week-day-2026-08-28"[^>]*href="\/events"/u);
  });

  it("gün bağlantısı açık paneli ve modalı düşürür", () => {
    const markup = renderStrip({ routeState: withRoute({ panel: "e1" }) });

    assert.doesNotMatch(markup, /panel=e1/u);
  });

  /**
   * Ş10 — iki kip, iki gerekçe.
   *
   * **Gün kutuları bir filtre** (`time=today` ya da filtreyi kaldırma) ve filtre yazımı
   * geçmiş yığınını büyütmez; yoksa geri tuşu ekrandan çıkamaz.
   *
   * **Oklar bir gezinme** (K9: "şerit bir gezinme aracı, bir süzgeç değil"). Üç hafta ileri
   * gidip geri tuşuna basan kullanıcı baktığı haftaya döner, ekrandan çıkmaz — Ş10 §5.6 bunu
   * kabul kriteri yapıyor.
   */
  it("gün kutuları replace, hafta okları push ile gider", () => {
    const markup = renderStrip();

    assert.equal(countMatches(markup, /data-nav="replace"/gu), 7);
    assert.equal(countMatches(markup, /data-nav="push"/gu), 2);
    assert.match(markup, /data-nav="push"[^>]*data-testid="events-week-previous"/u);
    assert.match(markup, /data-nav="push"[^>]*data-testid="events-week-next"/u);
  });
});

describe("EventWeekStrip — ölçü ve erişilebilirlik", () => {
  it("ölçüler sözlükten gelir", () => {
    const markup = renderStrip();

    assert.ok(
      markup.includes(`padding:${pxToRem(weekStrip.paddingY)} ${pxToRem(weekStrip.paddingX)}`),
    );
    assert.ok(markup.includes(`min-width:${pxToRem(weekStrip.monthLabelMinWidth)}`));
    assert.ok(markup.includes(`gap:${pxToRem(weekStrip.gridGap)}`));
  });

  it("arbitrary px sınıfı yok", () => {
    assert.doesNotMatch(renderStrip(), /-\[\d+(\.\d+)?px\]/u);
  });

  it("şeridin kendi erişilebilir adı var", () => {
    assert.ok(renderStrip().includes('aria-label="Hafta şeridi"'));
  });

  it("okların erişilebilir adı sözlükten gelir", () => {
    const markup = renderStrip();

    assert.ok(markup.includes('aria-label="Önceki hafta"'));
    assert.ok(markup.includes('aria-label="Sonraki hafta"'));
  });

  it("gün kutusunun erişilebilir adı tarih ve sayıyı metin olarak taşır", () => {
    assert.ok(renderStrip().includes('aria-label="27 Ağustos, 1 etkinlik"'));
  });
});
