import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { SettingsNav } from "@/components/settings/settings-nav";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { SETTINGS_TREE } from "@/lib/settings/tree";

const { nav } = SETTINGS_METRICS;

const IDENTITY = {
  avatarUrl: null,
  displayName: "Doğukan Yazar",
  status: "IDLE",
  username: "dogukan",
} as const;

/** K11 — web çalışma zamanında `Masaüstü` listeye girmez. */
const WEB_SECTIONS = SETTINGS_TREE.filter((section) => !section.desktopOnly);

function renderNav(sections: typeof SETTINGS_TREE = WEB_SECTIONS, query = "") {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SettingsNav
        activeSection="account"
        identity={IDENTITY}
        onQueryChange={() => {}}
        onSelect={() => {}}
        onSignOut={() => {}}
        query={query}
        sections={sections}
      />
    </LocaleProvider>,
  );
}

describe("SettingsNav", () => {
  // Etiket sözlükte cümle düzeninde durur; büyütme `text-transform` ile CSS'te yapılır, metin
  // iki kez yazılmaz.
  it("draws the three group labels in order", () => {
    const html = renderNav();
    const order = ["Kullanıcı", "Uygulama", "Bilgi"].map((label) => html.indexOf(`>${label}<`));

    for (const index of order) {
      assert.notEqual(index, -1);
    }

    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
    );
  });

  it("keeps `Masaüstü` out of the list on web and inside it on desktop (K11)", () => {
    const web = renderNav();
    assert.doesNotMatch(web, /data-section="desktop"/u);
    assert.doesNotMatch(web, />APP</u);

    const desktop = renderNav(SETTINGS_TREE);
    assert.match(desktop, /data-section="desktop"/u);
    assert.match(desktop, />APP</u);
  });

  it("is a tablist whose active row is the only tab stop", () => {
    const html = renderNav();

    assert.match(html, /role="tablist"/u);
    assert.equal(html.match(/role="tab"/gu)?.length, WEB_SECTIONS.length);
    assert.equal(html.match(/aria-selected="true"/gu)?.length, 1);
    assert.equal(html.match(/tabindex="0"/gu)?.length, 1);
  });

  it("takes its measurements from the dictionary, never from an arbitrary px class", () => {
    const html = renderNav();

    assert.match(html, new RegExp(`border-radius:${pxToRem(nav.rowRadius)}`, "u"));
    assert.match(html, new RegExp(`height:${pxToRem(nav.searchHeight)}`, "u"));
    assert.doesNotMatch(html, /class="[^"]*-\[\d+(\.\d+)?px\]/u);
  });

  it("marks the search box and offers a clear button only while it carries a query", () => {
    assert.doesNotMatch(renderNav(WEB_SECTIONS, ""), /data-testid="settings-search-clear"/u);

    const filled = renderNav(WEB_SECTIONS, "sessiz");
    assert.match(filled, /data-testid="settings-search-clear"/u);
    assert.match(
      filled,
      new RegExp(`hsl\\(var\\(--primary\\)/${nav.searchActiveBorderAlpha}\\)`, "u"),
    );
  });

  it("names the footer identity with the handle and the presence label", () => {
    const html = renderNav();

    assert.match(html, /@dogukan · Boşta/u);
    assert.match(html, /data-testid="settings-nav-sign-out"/u);
  });
});
