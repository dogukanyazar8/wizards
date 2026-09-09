import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { AppearanceAccessibilityTab } from "@/components/settings/sections/appearance/accessibility-tab";
import { AppearanceLayoutTab } from "@/components/settings/sections/appearance/layout-tab";
import { AppearanceMediaTab } from "@/components/settings/sections/appearance/media-tab";
import { AppearanceTextTab } from "@/components/settings/sections/appearance/text-tab";
import { AppearanceThemeTab } from "@/components/settings/sections/appearance/theme-tab";
import { getMessagesForLocale } from "@/lib/locale";
import { walkSettingsRows } from "@/lib/settings/tree";

/** Ş8 §B — beş sekmenin tamamı ağaçtan çiziliyor. */

/**
 * F2 — köprü sunucunun bildiği değerleri `useQuery` ile çekiyor (yenilemeden sonra da doğru
 * olsun diye), o yüzden yalıtılmış çizim de bir istemci istiyor. Ağa çıkılmıyor: `retry: false`
 * ve sonsuz `staleTime` ile sorgu ilk karede boş veriyle çözülüyor.
 */
function render(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        {node}
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

const rendered = {
  accessibility: render(<AppearanceAccessibilityTab />),
  layout: render(<AppearanceLayoutTab />),
  media: render(<AppearanceMediaTab />),
  text: render(<AppearanceTextTab />),
  theme: render(<AppearanceThemeTab />),
} as const;

function assertControlDisabled(markup: string, testId: string): void {
  const tag = markup.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];

  assert.ok(tag, `${testId} çizilmedi`);
  assert.match(tag, /(?:aria-disabled="true"|disabled="")/u, `${testId} etkileşime açık`);
}

describe("Görünüm sekmeleri", () => {
  it("beş sekme de ağaçtaki her satırını çiziyor", () => {
    for (const [tabKey, markup] of Object.entries(rendered)) {
      const rows = [...walkSettingsRows()]
        .filter((entry) => entry.section.key === "appearance" && entry.tab.key === tabKey)
        .map((entry) => entry.row.key);

      assert.ok(rows.length > 0, tabKey);

      for (const key of rows) {
        assert.ok(markup.includes(`data-setting-row="${key}"`), `${tabKey}/${key} çizilmedi`);
      }
    }
  });

  it("Tema sekmesi iki bloğu taşıyor; ızgara iskeletle geliyor", () => {
    assert.ok(rendered.theme.includes('data-block="themes"'));
    assert.ok(rendered.theme.includes('data-block-skeleton="themeGrid"'));
  });

  it("Metin sekmesi canlı önizlemeyi taşıyor", () => {
    assert.ok(rendered.text.includes('data-block="msgPreview"'));
    assert.ok(rendered.text.includes("Selin Aksoy"));
  });

  it("Düzen sekmesi uygulama simgesi ızgarasını taşıyor", () => {
    assert.ok(rendered.layout.includes('data-block="appIcons"'));
    assert.ok(rendered.layout.includes(">Wave 5<"));
  });

  it("Medya ve Erişilebilirlik aynı iki satırı ayrı sekmede çiziyor", () => {
    // SPEC_DEVIATIONS #4 — iki ayrı anahtar (`v7`/`x1`), tek durum.
    assert.ok(rendered.media.includes('data-setting-row="v7"'));
    assert.ok(rendered.accessibility.includes('data-setting-row="x1"'));
    assert.ok(rendered.media.includes('data-setting-row="v8"'));
    assert.ok(rendered.accessibility.includes('data-setting-row="x5"'));
  });

  it("Erişilebilirlik `Yazı boyutu` kaydırıcısını %85–130 aralığında çiziyor", () => {
    assert.ok(rendered.accessibility.includes('data-setting-row="x4"'));
    assert.ok(rendered.accessibility.includes('aria-valuemin="85"'));
    assert.ok(rendered.accessibility.includes('aria-valuemax="130"'));
  });

  it("henüz gerçek consumer'ı olmayan görünüm tercihleri kullanılamaz", () => {
    for (const testId of ["setting-slider-m2", "setting-toggle-m4"]) {
      assertControlDisabled(rendered.text, testId);
    }

    for (const testId of [
      "setting-toggle-v1",
      "setting-toggle-v2",
      "setting-toggle-v3",
      "setting-toggle-v4",
      "setting-toggle-v5",
      "setting-select-v6",
      "setting-toggle-v7",
      "setting-toggle-v8",
    ]) {
      assertControlDisabled(rendered.media, testId);
    }

    for (const testId of [
      "setting-toggle-x1",
      "setting-toggle-x2",
      "setting-toggle-x3",
      "setting-toggle-x5",
      "setting-toggle-x6",
      "setting-toggle-x7",
    ]) {
      assertControlDisabled(rendered.accessibility, testId);
    }
  });
});
