import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WhisprEvent } from "@wizards/types";

import { EVENT_CARD_MIN_HEIGHT } from "@/components/events/event-card";
import { EventCardSkeleton } from "@/components/events/event-card-skeleton";
import { EventGrid, type EventGridProps } from "@/components/events/event-grid";
import { EventsEmptyState } from "@/components/events/events-empty-state";
import { EventsErrorState } from "@/components/events/events-error-state";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş6 — ızgara, gün grupları, iskelet, boş ve hata durumu (SPEC §3.5, §3.7, §3.8).
 *
 * Boş ve hata metinleri **karakter karakter** SPEC'ten kopyalanmıştır; bir cümleyi kısaltan
 * değişiklik burada kırmızı verir. Sözlük tarafındaki ikizi `lib/locale/events-screen-copy.test.ts`
 * — bu dosya metnin **ekrana çıktığını** doğruluyor, orası sözlükte durduğunu.
 */

const { grid } = EVENTS_METRICS;
const NOW = new Date("2026-08-27T09:00:00.000Z");

function event(overrides: Partial<WhisprEvent> = {}): WhisprEvent {
  return {
    attendeePreview: [],
    channelId: "c1",
    channelLabel: "#tasarım-kritiği",
    dayBucket: "today",
    description: "",
    durationMinutes: 45,
    endsAt: null,
    goingCount: 3,
    host: { avatarUrl: null, id: "u1", initials: "SA", name: "Selin Aksoy" },
    id: "e1",
    isLive: false,
    isPublic: false,
    kind: "voice",
    maybeCount: 0,
    recurrenceRule: null,
    reminder: null,
    rsvp: null,
    serverId: "s1",
    serverName: "Whispr Topluluğu",
    startsAt: "2026-08-27T12:00:00.000Z",
    startsInMinutes: null,
    title: "Tasarım Kritiği",
    viewerCanManage: false,
    viewerIsMember: true,
    ...overrides,
  };
}

/**
 * Saat dilimi bilerek **verilmiyor**: hesap tercihi sağlayıcısı yokken varsayılan çalışma
 * zamanı sistem bölgesini kullanır. Kurgudaki başlangıçlar 12:00 UTC — ±11 saatlik her
 * bölgede aynı takvim gününde kalırlar, dolayısıyla grup tarihleri koşucunun bölgesine
 * bağlı değildir.
 */
function wrap(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

function render(overrides: Partial<EventGridProps> = {}): string {
  return wrap(<EventGrid events={[event()]} now={NOW} {...overrides} />);
}

const SAMPLE: WhisprEvent[] = [
  event({ dayBucket: "week", id: "w1", startsAt: "2026-08-29T12:00:00.000Z", title: "Turnuva" }),
  event({ dayBucket: "today", id: "t1", title: "Bugünkü" }),
  event({
    dayBucket: "week",
    id: "w2",
    startsAt: "2026-09-02T12:00:00.000Z",
    title: "Atölye",
  }),
  event({
    dayBucket: "tomorrow",
    id: "m1",
    startsAt: "2026-08-28T12:00:00.000Z",
    title: "Yarınki",
  }),
];

// ---------------------------------------------------------------------------
// Gün grupları
// ---------------------------------------------------------------------------

/** Grup başlıkları sırayla; `text-transform` görsel, markup etiketin kendisini taşır. */
function headings(markup: string): string[] {
  return [...markup.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gu)].map((match) => match[1] ?? "");
}

describe("EventGrid — gün grupları", () => {
  it("grup sırası bugün → yarın → bu hafta", () => {
    assert.deepEqual(headings(render({ events: SAMPLE })), ["Bugün", "Yarın", "Bu hafta"]);
  });

  it("boş grup render edilmez", () => {
    assert.deepEqual(headings(render({ events: [event({ dayBucket: "today" })] })), ["Bugün"]);
  });

  it("past kovası ızgarada çizilmez (sapma #5)", () => {
    const markup = render({
      events: [event({ dayBucket: "past", id: "p1", title: "Geçen hafta" })],
    });

    assert.deepEqual(headings(markup), []);
    assert.doesNotMatch(markup, /Geçen hafta/u);
  });

  it("time=past seçiliyken tek grup `Geçmiş` başlığıyla çizilir", () => {
    const markup = render({
      events: [event({ dayBucket: "past", id: "p1", title: "Geçen hafta" })],
      timeFilter: "past",
    });

    assert.deepEqual(headings(markup), ["Geçmiş"]);
    assert.match(markup, /Geçen hafta/u);
  });

  it("grup içi sıra startsAt ASC", () => {
    const markup = render({
      events: [
        event({ dayBucket: "today", id: "b", startsAt: "2026-08-27T14:00:00.000Z", title: "Geç" }),
        event({
          dayBucket: "today",
          id: "a",
          startsAt: "2026-08-27T11:00:00.000Z",
          title: "Erken",
        }),
      ],
    });

    assert.ok(markup.indexOf("Erken") < markup.indexOf("Geç"));
  });

  it("grup başlığı sayıyı ve tarihi yazar", () => {
    const markup = render({ events: SAMPLE });

    assert.match(markup, /27 Ağustos/u);
    assert.match(markup, /28 Ağustos/u);
    // Çok günlü grup aralık yazar (`events.grid.dateRange`).
    assert.match(markup, /29 Ağustos – 2 Eylül/u);
  });

  it("grup bir section, başlığı bir h2 ve ızgara role=grid değil", () => {
    const markup = render();

    assert.match(markup, /<section[^>]*aria-labelledby="([^"]+)"/u);
    const id = /<section[^>]*aria-labelledby="([^"]+)"/u.exec(markup)?.[1];
    assert.ok(id);
    assert.match(markup, new RegExp(`<h2[^>]*id="${id}"`, "u"));
    assert.doesNotMatch(markup, /role="grid"/u);
  });
});

// ---------------------------------------------------------------------------
// Izgara ölçüsü
// ---------------------------------------------------------------------------

describe("EventGrid — auto-fill minmax ve --e-min", () => {
  it("kolonlar auto-fill minmax(var(--e-min),1fr)", () => {
    assert.match(
      render(),
      /grid-template-columns:repeat\(auto-fill,minmax\(var\(--e-min\),1fr\)\)/u,
    );
  });

  it("orta boyutta --e-min 280, büyükte 340 — başka hiçbir şey değişmez", () => {
    const medium = render({ cardSize: "medium" });
    const large = render({ cardSize: "large" });

    assert.match(medium, new RegExp(`--e-min:${pxToRem(grid.minColumnWidth)}`, "u"));
    assert.match(large, new RegExp(`--e-min:${pxToRem(grid.minColumnWidthLarge)}`, "u"));
    assert.equal(
      medium.replace(pxToRem(grid.minColumnWidth), pxToRem(grid.minColumnWidthLarge)),
      large,
    );
  });

  it("değişken ızgara kabına bir kez yazılır", () => {
    const markup = render({ events: SAMPLE });

    assert.equal(markup.match(/--e-min:/gu)?.length, 1);
  });

  it("alt not kaydırma alanının sonunda", () => {
    assert.match(render(), /Geçmiş etkinlikler 30 gün arşivde tutulur/u);
  });
});

// ---------------------------------------------------------------------------
// İskelet
// ---------------------------------------------------------------------------

describe("EventGrid — sonsuz kaydırma (Ş10)", () => {
  const source = readFileSync(fileURLToPath(new URL("./event-grid.tsx", import.meta.url)), "utf8");

  it("sentinel her zaman çizilir ve alt notun üstünde durur", () => {
    const markup = render();

    const sentinel = markup.indexOf('data-testid="event-grid-sentinel"');
    const footer = markup.indexOf('data-testid="event-grid-footer"');

    assert.ok(sentinel > -1, "sentinel çizilmedi");
    // Alt not ızgaranın son öğesi; gözlemci ona takılsaydı sonraki sayfa ancak arşiv cümlesi
    // ekrana girdiğinde istenirdi.
    assert.ok(sentinel < footer, "sentinel alt notun altında kaldı");
  });

  it("yükleme metni yalnız `loadingMore` iken çıkar ve yüksekliği o zaman doğar", () => {
    const idle = render();
    const busy = render({ loadingMore: true });

    assert.doesNotMatch(idle, /Daha fazla yükleniyor/u);
    assert.match(busy, /Daha fazla yükleniyor/u);
    assert.match(busy, new RegExp(`min-height:${pxToRem(grid.footerPaddingTop)}`, "u"));
  });

  it("sentinel canlı bölge: sayfa geldiğinde ekran okuyucu duyuyor", () => {
    const markup = render({ loadingMore: true });
    const tag = markup.slice(
      markup.lastIndexOf("<div", markup.indexOf('data-testid="event-grid-sentinel"')),
      markup.indexOf(">", markup.indexOf('data-testid="event-grid-sentinel"')) + 1,
    );

    assert.match(tag, /aria-live="polite"/u);
    assert.match(tag, /role="status"/u);
  });

  /**
   * Tuzak #12 — gözlemci efektinin bağımlılıkları **ilkel** olmalı. `[listQuery]` gibi her
   * render'da kimliği değişen bir nesne yazılsaydı gözlemci her render'da sökülüp kurulur ve
   * sentinel görüş alanındayken ilk kesişimi tekrar bildirirdi: her render bir sayfa daha.
   */
  it("gözlemcinin bağımlılıkları ilkel", () => {
    assert.match(source, /\[events\.length, hasNextPage, onLoadMore\]/u);
    // Kök kaydırma kabı; verilmezse `rootMargin` yalnız en dıştaki dikdörtgeni büyütür.
    assert.match(source, /root: scrollRef\.current/u);
  });

  it("sonraki sayfa yokken gözlemci hiç kurulmaz", () => {
    assert.match(source, /if \(!node \|\| !hasNextPage \|\| !onLoadMore\) \{/u);
  });
});

describe("EventCardSkeleton — sıçrama yok", () => {
  it("üç kart, gerçek kartın yüksekliğinde", () => {
    const markup = wrap(<EventCardSkeleton />);
    const cards = markup.match(/data-testid="event-card-skeleton-item"/gu);

    assert.equal(cards?.length, 3);
    assert.equal(
      markup.match(new RegExp(`min-height:${pxToRem(EVENT_CARD_MIN_HEIGHT)}`, "gu"))?.length,
      3,
    );
  });

  it("ızgara ile aynı minmax ve gap", () => {
    const markup = wrap(<EventCardSkeleton />);

    assert.match(markup, /grid-template-columns:repeat\(auto-fill,minmax\(var\(--e-min\),1fr\)\)/u);
    assert.match(markup, new RegExp(`gap:${pxToRem(grid.gap)}`, "u"));
  });
});

// ---------------------------------------------------------------------------
// Boş durum — SPEC §3.7
// ---------------------------------------------------------------------------

describe("EventsEmptyState — SPEC §3.7 metinleri", () => {
  const BODY =
    "Bu filtrede yaklaşan etkinlik bulunmuyor. Sunucularından biri için etkinlik oluşturabilir ya da herkese açık topluluk etkinliklerine göz atabilirsin.";

  it("başlık ve gövde karakter karakter SPEC ile aynı", () => {
    const markup = wrap(<EventsEmptyState viewerCanCreate />);

    assert.match(markup, />Planlanmış etkinlik yok</u);
    assert.ok(markup.includes(BODY));
  });

  it("yetkili izleyicide iki buton", () => {
    const markup = wrap(<EventsEmptyState viewerCanCreate />);

    assert.match(markup, />Etkinlik oluştur</u);
    assert.match(markup, />Filtreleri temizle</u);
    assert.equal(markup.match(/<button/gu)?.length, 2);
  });

  it("viewerCanCreate=false iken tek buton kalıyor (K4)", () => {
    const markup = wrap(<EventsEmptyState viewerCanCreate={false} />);

    assert.doesNotMatch(markup, />Etkinlik oluştur</u);
    assert.match(markup, />Filtreleri temizle</u);
    assert.equal(markup.match(/<button/gu)?.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Hata durumu — SPEC §3.8
// ---------------------------------------------------------------------------

describe("EventsErrorState — SPEC §3.8 metinleri", () => {
  const BODY =
    "Sunucuyla bağlantı kurulamadı. Yeniden denerken kaydedilmiş katılım yanıtların korunur; yerel hatırlatmalar çalışmaya devam eder.";

  it("başlık ve gövde karakter karakter SPEC ile aynı", () => {
    const markup = wrap(<EventsErrorState lastAttemptAt={NOW} />);

    assert.match(markup, />Etkinlikler yüklenemedi</u);
    assert.ok(markup.includes(BODY));
  });

  it("kod verilmezse EVT-503 yazar", () => {
    const markup = wrap(<EventsErrorState lastAttemptAt={NOW} />);

    // Saat biçimi hesap tercihinin sözleşmesi (`formatAccountTime`); burada yalnız kodun
    // varsayılanı ve satırın kurulduğu doğrulanıyor.
    assert.match(markup, /Hata kodu: EVT-503 · son deneme \S/u);
  });

  it("sunucudan gelen kod yazılır", () => {
    const markup = wrap(<EventsErrorState code="EVT-429" lastAttemptAt={NOW} />);

    assert.match(markup, /Hata kodu: EVT-429/u);
  });

  it("durum sayfası adresi yoksa buton çizilmez", () => {
    const markup = wrap(<EventsErrorState lastAttemptAt={NOW} statusHref={null} />);

    assert.match(markup, />Yeniden dene</u);
    assert.doesNotMatch(markup, /Durum sayfası/u);
  });

  it("adres varken buton bir bağlantı", () => {
    const markup = wrap(
      <EventsErrorState lastAttemptAt={NOW} statusHref="https://status.whispr.test" />,
    );

    assert.match(markup, /<a[^>]*href="https:\/\/status\.whispr\.test"[^>]*>/u);
    assert.match(markup, /Durum sayfası/u);
  });
});
