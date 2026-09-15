import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { settingsQueryKeys } from "@/lib/settings/client";
import { SETTINGS_TEST_LAYOUT } from "@/lib/settings/read-test-fixtures";
import { renderToStaticMarkup } from "react-dom/server";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { AppearanceAccessibilityTab } from "@/components/settings/sections/appearance/accessibility-tab";
import { AppearanceLayoutTab } from "@/components/settings/sections/appearance/layout-tab";
import { AppearanceMediaTab } from "@/components/settings/sections/appearance/media-tab";
import { AppearanceTextTab } from "@/components/settings/sections/appearance/text-tab";
import { AppearanceThemeTab } from "@/components/settings/sections/appearance/theme-tab";
import { AppearanceLanguageTab } from "@/components/settings/sections/appearance/language-tab";
import { AvAudioTab } from "@/components/settings/sections/av/audio-tab";
import { AvCameraTab } from "@/components/settings/sections/av/camera-tab";
import { AvScreenShareTab } from "@/components/settings/sections/av/screen-share-tab";
import { renderSettingsSection } from "@/components/settings/settings-sections";
import type { SettingsSectionRenderInput } from "@/components/settings/settings-window";
import { getMessagesForLocale } from "@/lib/locale";
import type { SettingsSection } from "@/lib/settings/navigation";
import {
  SETTINGS_TREE,
  walkSettingsRows,
  type SettingsSectionDef,
  type SettingsTabDef,
} from "@/lib/settings/tree";

/**
 * Bölüm kayıt defteri — pencerenin `renderSection` yuvası.
 *
 * Bu dosyanın varlık sebebi bir **regresyon**: Dalga 3'ün dört şeridi de bölümlerini yazdı,
 * dördü de yuvayı "başkası bağlar" diye devretti ve pencere üründe boş bir yer tutucu çizdi.
 * Testin sorduğu tek soru bu: altı bölümün yirmi yedi sekmesinin **hepsi** gerçekten bir şey
 * çiziyor mu, yoksa defterde eksik bir dal mı var.
 *
 * İki katman var çünkü bölümlerin ihtiyaçları farklı:
 *
 * 1. **Yirmi yedi sekmenin hepsi** için ağaç düzeyinde kontrol — defter bir düğüm döndürüyor mu.
 * 2. **Çizilebilenler** için gerçek markup. `Bildirimler` bu katmanda yok: `useRouter()` çağırıyor
 *    ve app router bağlamı yalnız Next çalışma zamanında var (`invariant expected app router to
 *    be mounted`). Onu sahte bir bağlamla çizmek Next'in özel bir modül yolunu teste gömmek
 *    olurdu; kendi kapsamı `notifications-tab-body.test.tsx` altında zaten ölçülüyor.
 *
 * **F4 notu.** Defter bölümleri `next/dynamic` ile yüklüyor; Next çalışma zamanı olmayan bir
 * SSR testinde tembel parça çözülmez ve yerine yükleme iskeleti çizilir. Bu yüzden "her satır
 * çiziliyor mu" sorusu bileşenlere **doğrudan** soruluyor; defterin kendisi bir katman yukarıda,
 * "her sekme bir düğüm döndürüyor mu" ile ölçülüyor. İkisi birlikte eski regresyonu kapatır:
 * biri eksik dalı, diğeri eksik satırı yakalar.
 */

const TR = getMessagesForLocale("tr");

/** `useRouter()` istediği için SSR markup katmanının dışında (bkz. dosya başı). */
const NEEDS_APP_ROUTER: readonly SettingsSection[] = ["notifications"];

function makeInput(section: SettingsSectionDef, tabIndex: number): SettingsSectionRenderInput {
  const tab = section.tabs[tabIndex];
  assert.ok(tab, `${section.key}/${tabIndex} yok`);

  return {
    openRisky: null,
    openSelect: null,
    section,
    tab,
    toggleRisky: () => {},
    toggleSelect: () => {},
  };
}

/** Bölümler sorgu istemcisi okuyor (oturumlar, rozetler, boşta süresi); ağı hiç kullanmıyoruz. */
function render(input: SettingsSectionRenderInput) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider initialLocale="tr" initialMessages={TR}>
        {renderSettingsSection(input, null)}
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

/** Tek bir sekme bileşenini defterden geçmeden çizer (F4 — tembel parça SSR'de çözülmez). */
function renderNode(node: React.ReactNode) {
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

function assertControlDisabled(markup: string, testId: string): void {
  const tag = markup.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];

  assert.ok(tag, `${testId} çizilmedi`);
  assert.match(tag, /(?:aria-disabled="true"|disabled="")/u, `${testId} etkileşime açık`);
}

describe("renderSettingsSection — defter", () => {
  it("yirmi yedi sekmenin hepsi bir düğüm döndürüyor", () => {
    let checked = 0;

    for (const section of SETTINGS_TREE) {
      section.tabs.forEach((tab, index) => {
        const node = renderSettingsSection(makeInput(section, index), null);

        assert.ok(React.isValidElement(node), `${section.key}/${tab.key} defterde karşılıksız`);
        checked += 1;
      });
    }

    assert.equal(SETTINGS_TREE.length, 7);
    assert.equal(checked, 28);
  });

  it("çizilebilen beş bölüm gerçekten içerik basıyor, yer tutucu değil", () => {
    for (const section of SETTINGS_TREE) {
      if (NEEDS_APP_ROUTER.includes(section.key)) {
        continue;
      }

      const markup = render(makeInput(section, 0));

      assert.notEqual(markup, "", `${section.key} hiçbir şey çizmedi`);
      assert.ok(
        !markup.includes("settings-content-placeholder"),
        `${section.key} hâlâ yer tutucu çiziyor`,
      );
    }
  });

  it("`Ses ve Video` ile `Görünüm` ağaçtaki her satırını çiziyor", () => {
    // Ş8'in iki bölümü sekme dağıtıcısıyla bağlandı (kendi `renderXSection` kökleri yoktu);
    // dağıtıcının bir sekmeyi düşürmediği ancak satır sayısıyla ölçülebilir.
    const TABS: Readonly<Record<string, React.ComponentType<{ readonly tab?: SettingsTabDef }>>> = {
      accessibility: AppearanceAccessibilityTab,
      audio: AvAudioTab,
      camera: AvCameraTab,
      layout: AppearanceLayoutTab,
      media: AppearanceMediaTab,
      "screen-share": AvScreenShareTab,
      text: AppearanceTextTab,
      theme: AppearanceThemeTab,
      language: AppearanceLanguageTab,
    };

    for (const sectionKey of ["av", "appearance"] as const) {
      const section = SETTINGS_TREE.find((candidate) => candidate.key === sectionKey);
      assert.ok(section);

      section.tabs.forEach((tab) => {
        const TabComponent = TABS[tab.key];
        assert.ok(TabComponent, `${sectionKey}/${tab.key} bileşen haritasında yok`);

        const markup = renderNode(<TabComponent tab={tab} />);
        const rows = [...walkSettingsRows()].filter(
          (entry) => entry.section.key === sectionKey && entry.tab.key === tab.key,
        );

        assert.ok(rows.length > 0, `${sectionKey}/${tab.key} ağaçta boş`);

        for (const { row } of rows) {
          assert.ok(
            markup.includes(`data-setting-row="${row.key}"`),
            `${sectionKey}/${tab.key}/${row.key} çizilmedi`,
          );
        }
      });
    }
  });

  it("Ses ve Video kontrolleri gerçek consumer ve cihaz yeteneğine göre açılır", () => {
    const audio = renderNode(<AvAudioTab />);
    const camera = renderNode(<AvCameraTab />);
    const screenShare = renderNode(<AvScreenShareTab />);

    assertControlDisabled(audio, "setting-toggle-i4"); // SSR has no microphone API.
    for (const [markup, id] of [
      [audio, "setting-slider-u3"],
      [screenShare, "setting-toggle-e4"],
      [screenShare, "setting-toggle-e5"],
    ] as const) {
      const tag = markup.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`, "u"))?.[0];
      assert.ok(tag, id);
      assert.doesNotMatch(tag, /(?:aria-disabled="true"|disabled="")/u, `${id} must be usable`);
    }
    assertControlDisabled(camera, "setting-toggle-k3");
  });
});
