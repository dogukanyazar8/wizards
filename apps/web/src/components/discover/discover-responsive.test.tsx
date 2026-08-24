import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverCategory } from "@wizards/types";

import {
  DiscoverResponsive,
  buildDiscoverResponsiveCss,
  resolveDiscoverFocusWrapIndex,
  selectDiscoverResponsiveState,
  shouldTrapDiscoverPanelFocus,
} from "@/components/discover/discover-responsive";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { DISCOVER_DEFAULT_ROUTE_STATE } from "@/lib/discover/routes";

const CATEGORIES: readonly DiscoverCategory[] = [
  { count: 20, initials: "TÜ", key: "all", label: "Tümü" },
  { count: 4, initials: "OY", key: "oyun", label: "Oyun" },
  { count: 4, initials: "İŞ", key: "is", label: "İş" },
  { count: 4, initials: "ÇA", key: "calisma", label: "Çalışma" },
  { count: 4, initials: "Kİ", key: "kisisel", label: "Kişisel" },
  { count: 4, initials: "DE", key: "destek", label: "Destek" },
];

describe("Keşfet responsive eşikleri", () => {
  it("1100, 960 ve 720 sınırlarını kesin uygular", () => {
    assert.deepEqual(selectDiscoverResponsiveState(1100), {
      categoryStrip: false,
      directoryDrawer: false,
      panelOverlay: false,
      singleColumn: false,
    });
    assert.equal(selectDiscoverResponsiveState(1099).panelOverlay, true);
    assert.equal(selectDiscoverResponsiveState(960).directoryDrawer, false);
    assert.equal(selectDiscoverResponsiveState(959).directoryDrawer, true);
    assert.equal(selectDiscoverResponsiveState(959).categoryStrip, true);
    assert.equal(selectDiscoverResponsiveState(720).singleColumn, false);
    assert.equal(selectDiscoverResponsiveState(719).singleColumn, true);
  });

  it("viewport media sorguları, tek kolon, overlay ve reduced-motion kurallarını üretir", () => {
    const css = buildDiscoverResponsiveCss();

    assert.match(css, /@media \(max-width:1099px\)/u);
    assert.match(css, /@media \(max-width:959px\)/u);
    assert.match(css, /@media \(max-width:719px\)/u);
    assert.match(css, /grid-template-columns:minmax\(0,1fr\)!important/u);
    assert.match(css, /position:fixed/u);
    assert.match(css, /prefers-reduced-motion:reduce/u);
    assert.doesNotMatch(css, /@container/u);
    assert.doesNotMatch(css, /\bzoom\s*:/u);
  });

  it("kategori şeridini ortak altı kategori ve ortak href sözleşmesiyle çizer", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <DiscoverResponsive
          categories={CATEGORIES}
          onRequestPanelClose={() => undefined}
          panelServerId={null}
          route={{ ...DISCOVER_DEFAULT_ROUTE_STATE, category: "oyun" }}
        />
      </LocaleProvider>,
    );
    const options = markup.match(/data-testid="discover-category-strip-option"/gu) ?? [];

    assert.equal(options.length, 6);
    assert.match(markup, /role="listbox"/u);
    assert.equal(markup.match(/aria-selected="true"/gu)?.length, 1);
    assert.match(markup, /href="\/discover\?lane=servers&amp;cat=destek"/u);
  });

  it("overlay panel için erişilebilir backdrop kapatma kontrolü üretir", () => {
    const markup = renderToStaticMarkup(
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        <DiscoverResponsive
          categories={null}
          onRequestPanelClose={() => undefined}
          panelServerId="server-1"
          route={{ ...DISCOVER_DEFAULT_ROUTE_STATE, panelServerId: "server-1" }}
        />
      </LocaleProvider>,
    );

    assert.match(markup, /data-testid="discover-profile-backdrop"/u);
    assert.match(markup, /aria-label="Paneli kapat"/u);
  });

  it("odak tuzağı Tab/Shift+Tab uçlarında sarar", () => {
    assert.equal(resolveDiscoverFocusWrapIndex(2, 3, false), 0);
    assert.equal(resolveDiscoverFocusWrapIndex(0, 3, true), 2);
    assert.equal(resolveDiscoverFocusWrapIndex(1, 3, false), null);
    assert.equal(resolveDiscoverFocusWrapIndex(-1, 3, false), 0);
    assert.equal(resolveDiscoverFocusWrapIndex(-1, 3, true), 2);
    assert.equal(resolveDiscoverFocusWrapIndex(0, 0, false), null);
  });

  it("katıl modalı panelin üstündeyken panel odak tuzağını devre dışı bırakır", () => {
    assert.equal(shouldTrapDiscoverPanelFocus("server-1", null), true);
    assert.equal(shouldTrapDiscoverPanelFocus("server-1", "join"), false);
    assert.equal(shouldTrapDiscoverPanelFocus(null, null), false);
  });
});
