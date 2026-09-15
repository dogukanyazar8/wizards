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
import { AppearanceLanguageTab } from "@/components/settings/sections/appearance/language-tab";
import { getMessagesForLocale } from "@/lib/locale";
import { walkSettingsRows } from "@/lib/settings/tree";
import { settingsQueryKeys } from "@/lib/settings/client";
import { SETTINGS_TEST_LAYOUT } from "@/lib/settings/read-test-fixtures";

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
  queryClient.setQueryData(settingsQueryKeys.layout, SETTINGS_TEST_LAYOUT);

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        {node}
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

const rendered = {
  language: render(<AppearanceLanguageTab />),
  accessibility: render(<AppearanceAccessibilityTab />),
  layout: render(<AppearanceLayoutTab />),
  media: render(<AppearanceMediaTab />),
  text: render(<AppearanceTextTab />),
  theme: render(<AppearanceThemeTab />),
} as const;

function assertControlEnabled(markup: string, testId: string): void {
  const tag = markup.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];

  assert.ok(tag, `${testId} çizilmedi`);
  assert.doesNotMatch(tag, /(?:aria-disabled="true"|disabled="")/u, `${testId} etkileşime kapalı`);
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

  it("Düzen sekmesi uygulama simgesi seçeneğini taşımaz", () => {
    assert.doesNotMatch(rendered.layout, /data-block="appIcons"|Wave 5|Uygulama simgesi/u);
  });

  it("Erişilebilirlik `Yazı boyutu` kaydırıcısını %85–130 aralığında çiziyor", () => {
    assert.ok(rendered.accessibility.includes('data-setting-row="x4"'));
    assert.ok(rendered.accessibility.includes('aria-valuemin="85"'));
    assert.ok(rendered.accessibility.includes('aria-valuemax="130"'));
  });

  it("mesaj boyutu ve kompakt görünüm gerçek consumer ile kullanılabilir", () => {
    for (const testId of ["setting-slider-m2", "setting-toggle-m4"]) {
      const tag = rendered.text.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];
      assert.ok(tag);
      assert.doesNotMatch(tag, /(?:aria-disabled="true"|disabled="")/u);
    }
  });

  it("medya ve erişilebilirlik tercihleri kullanılabilir; kaldırılan kontroller çizilmez", () => {
    for (const testId of [
      "setting-toggle-v1",
      "setting-toggle-v2",
      "setting-toggle-v3",
      "setting-toggle-v4",
      "setting-toggle-v7",
    ]) {
      assertControlEnabled(rendered.media, testId);
    }

    for (const testId of ["setting-toggle-x2", "setting-toggle-x3"]) {
      assertControlEnabled(rendered.accessibility, testId);
    }
    assert.doesNotMatch(rendered.media, /data-setting-row="(?:v5|v6|v8)"/u);
    assert.doesNotMatch(
      rendered.accessibility,
      /data-setting-row="(?:x1|x5|x6|x7)"|Yardımcı teknolojiler/u,
    );
  });
});
