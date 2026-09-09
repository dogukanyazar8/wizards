import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { SettingsDirtyBar } from "@/components/settings/settings-dirty-bar";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsSaveIndicator } from "@/components/settings/settings-save-indicator";
import { SettingsSearchPanel } from "@/components/settings/settings-search-panel";
import { SettingsSkeleton } from "@/components/settings/settings-skeleton";
import { SettingsTabStrip } from "@/components/settings/settings-tab-strip";
import type { SettingsSaveState } from "@/components/settings/settings-window-state";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS, pxToRem } from "@/lib/settings/metrics";
import { SETTINGS_TAB_COUNTS, findSettingsSection } from "@/lib/settings/tree";

const { body, tabs } = SETTINGS_METRICS;

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {node}
    </LocaleProvider>,
  );
}

describe("SettingsHeader", () => {
  it("draws the section name and lead, and never the Web/Masaüstü segment (K11, sapma #3)", () => {
    const html = render(
      <SettingsHeader
        leadKey="settings.section.notifications.lead"
        onClose={() => {}}
        saveState="idle"
        titleId="t"
        titleKey="settings.section.notifications.label"
      />,
    );

    assert.match(html, /Bildirimler/u);
    assert.match(html, /Düzey, yüzeyler, türler/u);
    assert.doesNotMatch(html, />Masaüstü</u);
    assert.doesNotMatch(html, />Web</u);
  });

  it("keeps the close control reachable by name", () => {
    const html = render(
      <SettingsHeader
        leadKey="settings.section.account.lead"
        onClose={() => {}}
        saveState="idle"
        titleId="t"
        titleKey="settings.section.account.label"
      />,
    );

    assert.match(html, /data-testid="in-app-settings-close"/u);
    assert.match(html, /aria-label="Kapat"/u);
  });
});

describe("SettingsSaveIndicator", () => {
  const LABELS: Readonly<Record<Exclude<SettingsSaveState, "idle">, string>> = {
    error: "Kaydedilemedi · yeniden dene",
    saved: "Kaydedildi",
    saving: "Kaydediliyor",
  };

  it("announces the three states politely", () => {
    for (const [state, label] of Object.entries(LABELS)) {
      const html = render(<SettingsSaveIndicator state={state as SettingsSaveState} />);

      assert.match(html, /aria-live="polite"/u);
      assert.match(html, new RegExp(`data-save-state="${state}"`, "u"));
      assert.ok(html.includes(label), `${state} must read "${label}"`);
    }
  });

  it("says nothing before anything has been saved", () => {
    const html = render(<SettingsSaveIndicator state="idle" />);

    assert.match(html, /data-save-state="idle"/u);
    for (const label of Object.values(LABELS)) {
      assert.ok(!html.includes(label));
    }
  });

  it("turns into a retry control only when the last patch failed", () => {
    const failed = render(<SettingsSaveIndicator onRetry={() => {}} state="error" />);
    assert.match(failed, /<button/u);

    const saved = render(<SettingsSaveIndicator onRetry={() => {}} state="saved" />);
    assert.doesNotMatch(saved, /<button/u);
  });
});

describe("SettingsTabStrip", () => {
  it("is not rendered at all when the section carries a single tab (Hakkında)", () => {
    const about = findSettingsSection("about");
    assert.equal(SETTINGS_TAB_COUNTS.about, 1);

    const html = render(
      <SettingsTabStrip activeTab="about" onSelect={() => {}} tabs={about?.tabs ?? []} />,
    );

    assert.equal(html, "");
  });

  it("draws one tab per tree entry with a single tab stop and a single active bar", () => {
    const notifications = findSettingsSection("notifications");

    const html = render(
      <SettingsTabStrip
        activeTab="quiet-hours"
        onSelect={() => {}}
        tabs={notifications?.tabs ?? []}
      />,
    );

    assert.equal(html.match(/role="tab"/gu)?.length, SETTINGS_TAB_COUNTS.notifications);
    assert.equal(html.match(/aria-selected="true"/gu)?.length, 1);
    assert.equal(html.match(/tabindex="0"/gu)?.length, 1);
    assert.match(html, new RegExp(`height:${pxToRem(tabs.tabHeight)}`, "u"));
    assert.match(html, /Sessiz saatler/u);
  });
});

describe("SettingsSkeleton", () => {
  it("draws the four blocks the design counted, in rem", () => {
    const html = render(<SettingsSkeleton />);

    assert.equal(body.skeletonHeights.length, 4);

    for (const height of body.skeletonHeights) {
      assert.match(html, new RegExp(`height:${pxToRem(height)}`, "u"));
    }

    assert.doesNotMatch(html, /height:\d+px/u);
  });
});

describe("SettingsDirtyBar", () => {
  it("carries the design's copy verbatim with both controls", () => {
    const html = render(<SettingsDirtyBar onDiscard={() => {}} onSave={() => {}} />);

    assert.match(html, /Kaydedilmemiş değişikliklerin var\./u);
    assert.match(html, /Sıfırla/u);
    assert.match(html, /Değişiklikleri kaydet/u);
  });
});

describe("SettingsSearchPanel", () => {
  it("counts the hits and shows the `Bölüm › Grup` path for each", () => {
    const html = render(<SettingsSearchPanel onSelect={() => {}} query="sessiz" />);

    assert.match(html, /Arama sonuçları · \d+/u);
    assert.match(html, /data-testid="settings-search-hit"/u);
    assert.match(html, /›/u);
  });

  it("returns an empty result set rather than everything for a query nothing matches", () => {
    const html = render(<SettingsSearchPanel onSelect={() => {}} query="zzzzqqq" />);

    assert.match(html, /Arama sonuçları · 0/u);
    assert.doesNotMatch(html, /data-testid="settings-search-hit"/u);
  });
});
