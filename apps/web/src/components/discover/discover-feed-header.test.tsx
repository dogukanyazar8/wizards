import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DiscoverFeedHeader,
  resolveDiscoverFeedSubtitle,
  resolveDiscoverFeedTitle,
} from "@/components/discover/discover-feed-header";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { DISCOVER_DEFAULT_ROUTE_STATE, type DiscoverRouteState } from "@/lib/discover/routes";

const translate = (key: string, values?: Record<string, number | string>): string => {
  const messages: Readonly<Record<string, string>> = TR_MESSAGES;
  const template = messages[key] ?? key;
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    template,
  );
};

function route(overrides: Partial<DiscoverRouteState> = {}): DiscoverRouteState {
  return { ...DISCOVER_DEFAULT_ROUTE_STATE, ...overrides };
}

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof DiscoverFeedHeader>> = {},
): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
      <DiscoverFeedHeader
        cardSize="medium"
        failedAt={null}
        isEmpty={false}
        isError={false}
        laneCounts={{ channels: null, events: 4, people: null, servers: 20 }}
        onToggleCardSize={() => undefined}
        resultCount={20}
        route={route()}
        visibility={{ iconGroup: true, laneGroup: true }}
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("DiscoverFeedHeader", () => {
  it("başlık önceliğini arama, şerit, kategori, varsayılan sırasında uygular", () => {
    assert.equal(
      resolveDiscoverFeedTitle(
        route({ category: "oyun", lane: "people", q: "tasarım" }),
        translate,
      ),
      "Arama sonuçları",
    );
    assert.equal(resolveDiscoverFeedTitle(route({ lane: "people" }), translate), "Kişiler");
    assert.equal(resolveDiscoverFeedTitle(route({ lane: "channels" }), translate), "Kanallar");
    assert.equal(resolveDiscoverFeedTitle(route({ lane: "events" }), translate), "Etkinlikler");
    assert.equal(resolveDiscoverFeedTitle(route({ category: "oyun" }), translate), "Oyun");
    assert.equal(resolveDiscoverFeedTitle(route(), translate), "Keşfet");
  });

  it("normal, sayısız, boş ve gerçek saatli hata alt satırlarını üretir", () => {
    assert.equal(
      resolveDiscoverFeedSubtitle({
        failedAt: null,
        isEmpty: false,
        isError: false,
        resultCount: 20,
        route: route(),
        t: translate,
      }),
      "20 sunucu · 6 kategori · popüler sıralı",
    );
    assert.equal(
      resolveDiscoverFeedSubtitle({
        failedAt: null,
        isEmpty: false,
        isError: false,
        resultCount: null,
        route: route(),
        t: translate,
      }),
      "Keşfet · 6 kategori · popüler sıralı",
    );
    assert.equal(
      resolveDiscoverFeedSubtitle({
        failedAt: null,
        isEmpty: true,
        isError: false,
        resultCount: 0,
        route: route(),
        t: translate,
      }),
      "0 sonuç · Dizinde eşleşme yok · filtreleri temizleyebilirsin",
    );
    assert.equal(
      resolveDiscoverFeedSubtitle({
        failedAt: new Date(2026, 7, 21, 9, 41),
        isEmpty: false,
        isError: true,
        resultCount: null,
        route: route(),
        t: translate,
      }),
      "Bağlantı yok · Dizin eşitlemesi 09:41’de kesildi · kendi sunucuların etkilenmedi",
    );
  });

  it("sekmeleri erişilebilir URL linkleri yapar; bilinmeyen sayaç yok, gerçek sıfır var", () => {
    const markup = renderHeader({
      laneCounts: { channels: 0, events: 4, people: null, servers: 20 },
    });

    assert.match(markup, /role="tablist"/);
    assert.match(
      markup,
      /<a(?=[^>]*role="tab")(?=[^>]*aria-selected="true")(?=[^>]*href="\/discover")[^>]*>/,
    );
    assert.match(markup, /<a(?=[^>]*role="tab")(?=[^>]*href="\/discover\?lane=channels")[^>]*>/);
    assert.doesNotMatch(markup, /data-testid="discover-lane-count-people"/);
    assert.match(markup, /data-testid="discover-lane-count-channels"[^>]*>0</);
    assert.match(markup, /aria-label="Sunucular: 20"/);
    assert.match(
      markup,
      /<span(?=[^>]*aria-hidden="true")(?=[^>]*data-testid="discover-lane-count-servers")[^>]*>/,
    );
  });

  it("ikon butonları aria sözleşmesini taşır", () => {
    const markup = renderHeader();

    assert.match(markup, /aria-label="Sunucuya katıl"/);
    assert.match(markup, /aria-label="Kart boyutu"/);
    assert.match(markup, /aria-pressed="false"/);
    assert.equal(markup.match(/before:-inset-1\.5/gu)?.length, 2);
  });

  it("panel açıkken şerit ve ikon gruplarını DOM'dan çıkarır", () => {
    const markup = renderHeader({ visibility: { iconGroup: false, laneGroup: false } });

    assert.doesNotMatch(markup, /data-testid="discover-lane-group"/);
    assert.doesNotMatch(markup, /data-testid="discover-icon-group"/);
  });
});
