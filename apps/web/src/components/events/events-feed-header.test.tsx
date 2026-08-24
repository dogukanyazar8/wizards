import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventCounts } from "@wizards/types";

import {
  EVENT_HEADER_TABS,
  EventsFeedHeader,
  buildEventsFeedSubline,
  resolveEventsFeedTitle,
} from "@/components/events/events-feed-header";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { EVENTS_METRICS, pxToRem } from "@/lib/events/metrics";
import { EVENTS_DEFAULT_ROUTE_STATE, type EventsRouteState } from "@/lib/events/routes";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * Ş5 — akış başlığı (SPEC §3.1).
 *
 * Başlık **saf sunum**: sorgu açmaz, sayı toplamaz. Sekme pilleri, alt satır ve gezinme
 * panelindeki ipucu aynı `EventCounts` nesnesinden okunur (SPEC §8) ve bu sayaçlar
 * **filtresizdir** (tuzak #3): filtre açıkken bütün sekmeler `0` görünseydi tıklanamaz
 * sanılırdı.
 */

const { feedHeader } = EVENTS_METRICS;
const MESSAGES = getMessagesForLocale("tr");

/** Sözlüğü doğrudan okuyan sahte çevirici: metin iddiaları `tr.ts` ile birebir kalsın diye. */
function translate(key: string, values: Record<string, number | string> = {}): string {
  const template = (MESSAGES as Record<string, string>)[key] ?? key;

  return template.replace(/\{(\w+)\}/gu, (match, name: string) =>
    values[name] === undefined ? match : String(values[name]),
  );
}

function counts(overrides: Partial<EventCounts> = {}): EventCounts {
  return {
    all: 8,
    going: 2,
    live: 1,
    liveNow: true,
    nextStartsAt: "2026-08-26T12:00:00.000Z",
    upcoming: 7,
    ...overrides,
  };
}

function withRoute(patch: Partial<EventsRouteState>): EventsRouteState {
  return { ...EVENTS_DEFAULT_ROUTE_STATE, ...patch };
}

/** Öznitelik sırası bir uygulama ayrıntısı; iddia açılış etiketinin **tamamı** üzerinden kurulur. */
function tag(markup: string, testId: string): string {
  return new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`, "u").exec(markup)?.[0] ?? "";
}

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof EventsFeedHeader>> = {},
  locale: "en" | "tr" = "tr",
) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale} initialMessages={getMessagesForLocale(locale)}>
      <EventsFeedHeader
        counts={counts()}
        detailPanelOpen={false}
        empty={false}
        error={false}
        itemCount={8}
        lastSyncedLabel="09:41"
        notificationsEnabled
        onOpenCreate={() => undefined}
        onToggleCardSize={() => undefined}
        onToggleNotifications={() => undefined}
        routeState={EVENTS_DEFAULT_ROUTE_STATE}
        sourceTitle={null}
        viewerCanCreate
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("resolveEventsFeedTitle — altı dal (SPEC_DEVIATIONS #4)", () => {
  it("arama sorgusu her şeyi yener", () => {
    assert.equal(
      resolveEventsFeedTitle(withRoute({ query: "oyun", tab: "live" }), "Oyun Kulübü", translate),
      "Arama sonuçları",
    );
  });

  it("kaynak filtresi seçiliyken sunucu adını yazar", () => {
    assert.equal(
      resolveEventsFeedTitle(withRoute({ source: "s1", tab: "live" }), "Oyun Kulübü", translate),
      "Oyun Kulübü",
    );
  });

  it("kaynak adı henüz yüklenmediyse sekme dalına düşer", () => {
    assert.equal(
      resolveEventsFeedTitle(withRoute({ source: "s1", tab: "live" }), null, translate),
      "Canlı",
    );
  });

  it("Canlı sekmesi", () => {
    assert.equal(resolveEventsFeedTitle(withRoute({ tab: "live" }), null, translate), "Canlı");
  });

  it("Katılacağım sekmesi", () => {
    assert.equal(
      resolveEventsFeedTitle(withRoute({ tab: "going" }), null, translate),
      "Katılacağım",
    );
  });

  it("time=today Bugün yazar", () => {
    assert.equal(resolveEventsFeedTitle(withRoute({ time: "today" }), null, translate), "Bugün");
  });

  it("varsayılan Etkinlikler", () => {
    assert.equal(
      resolveEventsFeedTitle(EVENTS_DEFAULT_ROUTE_STATE, null, translate),
      "Etkinlikler",
    );
  });

  it("Yaklaşan sekmesinin kendi başlığı yok, varsayılana düşer", () => {
    assert.equal(
      resolveEventsFeedTitle(withRoute({ tab: "upcoming" }), null, translate),
      "Etkinlikler",
    );
  });
});

describe("buildEventsFeedSubline — dört durum (SPEC §3.1)", () => {
  it("normal", () => {
    assert.equal(
      buildEventsFeedSubline(
        {
          counts: counts(),
          empty: false,
          error: false,
          itemCount: 8,
          lastSyncedLabel: "09:41",
          notificationsEnabled: true,
          query: null,
        },
        translate,
      ),
      "8 etkinlik · Güne göre gruplu · 1 canlı · 2 katılım · takvim bağlı",
    );
  });

  it("takvim kapalıyken son parça değişir (K7)", () => {
    assert.match(
      buildEventsFeedSubline(
        {
          counts: counts(),
          empty: false,
          error: false,
          itemCount: 8,
          lastSyncedLabel: "09:41",
          notificationsEnabled: false,
          query: null,
        },
        translate,
      ),
      /takvim bağlı değil$/u,
    );
  });

  it("arama", () => {
    assert.equal(
      buildEventsFeedSubline(
        {
          counts: counts(),
          empty: false,
          error: false,
          itemCount: 2,
          lastSyncedLabel: "09:41",
          notificationsEnabled: true,
          query: "oyun",
        },
        translate,
      ),
      "2 etkinlik · “oyun” için 2 sonuç · 1 canlı · 2 katılım · takvim bağlı",
    );
  });

  it("boş", () => {
    assert.equal(
      buildEventsFeedSubline(
        {
          counts: counts({ all: 0, going: 0, live: 0, liveNow: false, upcoming: 0 }),
          empty: true,
          error: false,
          itemCount: 0,
          lastSyncedLabel: "09:41",
          notificationsEnabled: true,
          query: null,
        },
        translate,
      ),
      "0 etkinlik · Yaklaşan etkinlik yok · filtreleri temizleyebilirsin",
    );
  });

  it("hata", () => {
    assert.equal(
      buildEventsFeedSubline(
        {
          counts: null,
          empty: false,
          error: true,
          itemCount: null,
          lastSyncedLabel: "09:41",
          notificationsEnabled: true,
          query: null,
        },
        translate,
      ),
      "Bağlantı yok · Son eşitleme 09:41 · yerel hatırlatmalar çalışıyor",
    );
  });

  it("hata boş durumu yener", () => {
    assert.match(
      buildEventsFeedSubline(
        {
          counts: null,
          empty: true,
          error: true,
          itemCount: 0,
          lastSyncedLabel: "09:41",
          notificationsEnabled: true,
          query: null,
        },
        translate,
      ),
      /^Bağlantı yok/u,
    );
  });

  it("sayaç henüz gelmemişken sıfır yazar, satırı kırmaz", () => {
    assert.equal(
      buildEventsFeedSubline(
        {
          counts: null,
          empty: false,
          error: false,
          itemCount: 3,
          lastSyncedLabel: null,
          notificationsEnabled: true,
          query: null,
        },
        translate,
      ),
      "3 etkinlik · Güne göre gruplu · 0 canlı · 0 katılım · takvim bağlı",
    );
  });
});

describe("EventsFeedHeader — daralma kuralı (SPEC §3.1 zorunlu)", () => {
  it("detay paneli açıkken sekme grubu DOM'da yok", () => {
    const markup = renderHeader({ detailPanelOpen: true });

    assert.doesNotMatch(markup, /data-testid="events-feed-tabs"/u);
  });

  it("detay paneli açıkken ikon grubu da DOM'da yok", () => {
    const markup = renderHeader({ detailPanelOpen: true });

    assert.doesNotMatch(markup, /data-testid="events-feed-actions"/u);
  });

  it("panel kapalıyken ikisi de var", () => {
    const markup = renderHeader();

    assert.match(markup, /data-testid="events-feed-tabs"/u);
    assert.match(markup, /data-testid="events-feed-actions"/u);
  });

  it("panel açıkken başlık ve alt satır kalır", () => {
    const markup = renderHeader({ detailPanelOpen: true });

    assert.match(markup, /data-testid="events-feed-title"/u);
    assert.match(markup, /data-testid="events-feed-subline"/u);
  });
});

describe("EventsFeedHeader — 432 px'de tek satır", () => {
  it("başlık kabı sarmıyor", () => {
    assert.match(tag(renderHeader(), "events-feed-header"), /flex-nowrap/u);
  });

  it("başlık bloğu 170 px tabanla esniyor ve daralabiliyor", () => {
    const markup = renderHeader();

    assert.ok(markup.includes(`flex:1 1 ${pxToRem(feedHeader.titleBlockBasis)}`));
    assert.ok(markup.includes("min-width:0"));
  });

  it("başlık ve alt satır tek satırda kırpılıyor", () => {
    assert.equal(
      renderHeader().match(/text-overflow:ellipsis/gu)?.length,
      2,
      "başlık ve alt satırın ikisi de ellipsis taşımalı",
    );
  });

  it("sekme grubu ve ikon grubu daralmıyor (flex:none)", () => {
    const markup = renderHeader();

    assert.ok(markup.includes("flex:none"));
  });
});

describe("EventsFeedHeader — sekmeler", () => {
  it("dört sekmeyi sırayla çizer", () => {
    assert.deepEqual(
      EVENT_HEADER_TABS.map((tab) => tab.id),
      ["all", "upcoming", "live", "going"],
    );
  });

  it("pil sayıları filtresiz sayaçtan gelir (tuzak #3)", () => {
    const markup = renderHeader({
      counts: counts({ all: 8, going: 2, live: 1, upcoming: 7 }),
      routeState: withRoute({ source: "s1", time: "today" }),
    });

    for (const value of [8, 7, 1, 2]) {
      assert.match(markup, new RegExp(`>${value}</span>`, "u"));
    }
  });

  it("sıfır sayaçlı sekmede pil çizilmez", () => {
    const markup = renderHeader({ counts: counts({ live: 0 }) });

    assert.doesNotMatch(markup, /data-testid="events-feed-tab-pill-live"/u);
  });

  it("aktif sekme aria-current taşır", () => {
    const markup = renderHeader({ routeState: withRoute({ tab: "live" }) });

    assert.match(tag(markup, "events-feed-tab-live"), /aria-current="true"/u);
  });

  it("aynı sekmeye ikinci tık varsayılana döner", () => {
    const markup = renderHeader({ routeState: withRoute({ tab: "live" }) });

    assert.match(tag(markup, "events-feed-tab-live"), /href="\/events"/u);
  });

  it("sekme bağlantısı paneli düşürür ve replace ile gider", () => {
    const markup = renderHeader({ routeState: withRoute({ panel: "e1" }) });

    assert.doesNotMatch(markup, /panel=e1/u);
    assert.match(tag(markup, "events-feed-tab-live"), /data-nav="replace"/u);
  });

  it("pil sayısı ekran okuyucuya metin olarak da gider", () => {
    assert.ok(renderHeader().includes("8 etkinlik"));
  });
});

describe("EventsFeedHeader — ikon grubu (K4 · K7 · K11)", () => {
  it("viewerCanCreate false iken Oluştur butonu çizilmiyor", () => {
    assert.doesNotMatch(
      renderHeader({ viewerCanCreate: false }),
      /data-testid="events-feed-create"/u,
    );
  });

  it("viewerCanCreate true iken çiziliyor", () => {
    assert.match(renderHeader(), /data-testid="events-feed-create"/u);
  });

  it("kart boyutu ve zil her zaman var", () => {
    const markup = renderHeader({ viewerCanCreate: false });

    assert.match(markup, /data-testid="events-feed-card-size"/u);
    assert.match(markup, /data-testid="events-feed-bell"/u);
  });

  it("zil açıkken basılı durumu taşır", () => {
    assert.match(tag(renderHeader(), "events-feed-bell"), /aria-pressed="true"/u);
  });

  it("zil kapalıyken de basılı durumu taşır", () => {
    assert.match(
      tag(renderHeader({ notificationsEnabled: false }), "events-feed-bell"),
      /aria-pressed="false"/u,
    );
  });

  it("kart boyutu düğmesi sıradaki boyutu duyurur", () => {
    const markup = renderHeader();

    assert.match(tag(markup, "events-feed-card-size"), /aria-pressed="false"/u);
    assert.match(
      tag(renderHeader({ routeState: withRoute({ size: "large" }) }), "events-feed-card-size"),
      /aria-pressed="true"/u,
    );
  });

  it("ikon-only butonların hepsi erişilebilir ad taşıyor", () => {
    const markup = renderHeader();

    assert.ok(markup.includes('aria-label="Etkinlik oluştur"'));
    assert.ok(markup.includes('aria-label="Kart boyutu"'));
    assert.ok(markup.includes('aria-label="Etkinlik bildirimleri"'));
  });
});

describe("EventsFeedHeader — ölçü ve renk", () => {
  it("ölçüler sözlükten gelir", () => {
    const markup = renderHeader();

    assert.ok(
      markup.includes(`padding:${pxToRem(feedHeader.paddingY)} ${pxToRem(feedHeader.paddingX)}`),
    );
    assert.ok(markup.includes(`height:${pxToRem(feedHeader.tabHeight)}`));
    assert.ok(markup.includes(`width:${pxToRem(feedHeader.iconButtonSize)}`));
  });

  it("arbitrary px sınıfı yok", () => {
    assert.doesNotMatch(renderHeader(), /-\[\d+(\.\d+)?px\]/u);
  });

  it("sabit renk hiç yok; primary zemin üstündeki ters metin token sınıfından gelir", () => {
    const markup = renderHeader({ routeState: withRoute({ tab: "live" }) });

    assert.equal(markup.match(/#[0-9a-f]{3,8}\b/giu), null);
    assert.match(tag(markup, "events-feed-tab-live"), /text-white/u);
  });

  it("sekme listesinin erişilebilir adı sözlükten", () => {
    assert.ok(renderHeader().includes('aria-label="Etkinlik sekmeleri"'));
  });
});
