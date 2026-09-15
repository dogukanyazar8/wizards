import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { AboutPage } from "@/components/settings/sections/about/about-page";
import { getMessagesForLocale } from "@/lib/locale";
import { NATIVE_DESKTOP_SETTINGS_KEY } from "@/lib/desktop/settings-client";
import { appUpdateQueryOptions } from "@/lib/app-update-query";
import {
  DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
  DESKTOP_SHORTCUT_ACTIONS,
} from "@/lib/desktop/shortcuts";
import { UNKNOWN_DESKTOP_PERMISSIONS } from "@/lib/desktop/permissions";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import { DesktopTabBody } from "./desktop-tab-body";
import { SETTINGS_TAB_COUNTS, findSettingsSection, findSettingsTab } from "@/lib/settings/tree";

import {
  DESKTOP_RUNTIME_QUERY_KEY,
  DesktopSection,
  type DesktopRuntimeSnapshot,
} from "./desktop-section";

/** Ş10 — bölüm kökü: yirmi üç satır + Hakkında'nın altı satırı. */

const messages = getMessagesForLocale("tr");

const BOOTSTRAP: SettingsBootstrapPayload = {
  buildInfo: {
    buildId: "4812",
    buildTime: "24 Ağu 2026 09:12",
    contributors: ["Doğukan Yazar", "Grace"],
    developerName: "Doğukan Yazar",
    featuredContributor: null,
    lastUpdated: "24 Ağustos 2026",
    notes: [],
    releaseChannel: "stable",
    version: "2.4.1",
  },
  initialAccount: {
    avatarUrl: null,
    displayName: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    id: "user-1",
    status: "ONLINE",
    twoFactorEnabled: false,
    username: "ada",
  },
  preferredReleaseChannel: "UAT",
  uploadthingEnabled: false,
};

function render(node: React.ReactNode, snapshot?: DesktopRuntimeSnapshot): string {
  // Sorgu istemcisi test başına yeni: bir sekmenin okuması diğerine sızmasın.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (snapshot) client.setQueryData(DESKTOP_RUNTIME_QUERY_KEY, snapshot);
  if (snapshot)
    client.setQueryData(appUpdateQueryOptions(false).queryKey, {
      enabled: true,
      available: false,
      latestVersion: null,
      currentVersion: "1.0.0",
      webVersion: null,
      checkedAt: 0,
    });
  client.setQueryData(NATIVE_DESKTOP_SETTINGS_KEY, {
    application: { launchOnStartup: true, closeAction: "tray", gameDetectionEnabled: false },
    shortcuts: {
      enabled: false,
      entries: DESKTOP_SHORTCUT_ACTIONS.map((action) => ({
        action:
          action === "hideOverlay"
            ? "hideGameOverlay"
            : action === "moderationConsole"
              ? "toggleAdminConsole"
              : action,
        keys: DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS[action].split("+"),
        conflict: false,
        registered: false,
      })),
    },
    platform: { os: "windows", arch: "x86_64", family: "windows" },
    updater: {
      enabled: snapshot?.appInfo?.updaterEnabled ?? false,
      available: false,
      currentVersion: "1.0.0",
      latestVersion: null,
    },
  });

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={messages}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </LocaleProvider>,
  );
}

function assertControlDisabled(markup: string, testId: string): void {
  const tag = markup.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];

  assert.ok(tag, `${testId} çizilmedi`);
  assert.match(tag, /(?:aria-disabled="true"|disabled="")/u, `${testId} etkileşime açık`);
}

function assertControlEnabled(markup: string, testId: string): void {
  const tag = markup.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];

  assert.ok(tag, `${testId} çizilmedi`);
  assert.doesNotMatch(tag, /(?:aria-disabled="true"|disabled="")/u, `${testId} kapalı`);
}

describe("DesktopSection — beş sekme", () => {
  it("her sekme kendi satırlarını çiziyor", () => {
    const section = findSettingsSection("desktop");
    assert.ok(section);

    let drawn = 0;

    for (const tab of section.tabs) {
      const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab={tab.key} />);

      for (const group of tab.groups) {
        for (const row of group.rows) {
          assert.ok(
            markup.includes(`data-setting-row="${row.key}"`) ||
              markup.includes(`settings-block-${row.key}`),
            `${tab.key} › ${row.key} çizilmiyor`,
          );
          drawn += 1;
        }
      }
    }

    assert.equal(drawn, 18);
  });

  it("Masaüstü bölümü ağaçta yalnız masaüstünde listeleniyor", () => {
    const section = findSettingsSection("desktop");

    assert.equal(section?.desktopOnly, true);
    assert.equal(section?.tabs.length, SETTINGS_TAB_COUNTS.desktop);
  });

  it("keeps diagnostics collapsed and release history inline by default", () => {
    const tab = findSettingsTab("updates", "updates")!;
    const markup = render(
      <DesktopTabBody
        tab={{
          ...tab,
          groups: tab.groups.map((group) => ({
            ...group,
            rows: group.rows.filter((row) => row.key === "n3" || row.key === "o5"),
          })),
        }}
      />,
    );
    const disclosure = markup.match(
      /<details[^>]*data-testid="settings-diagnostics-disclosure"[^>]*>/u,
    )?.[0];
    assert.ok(disclosure);
    assert.doesNotMatch(disclosure, / open(?:=|>| )/u);
    assert.ok(markup.includes('data-setting-row="o5"'));
    assert.ok(!markup.includes('role="dialog"'));
  });

  it("`z7` hedefi olmadığı için devre dışı çiziliyor", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="overlay" />);

    assert.ok(markup.includes('data-setting-row-gate="z7"'));
    assert.ok(markup.includes('aria-disabled="true"'));
  });

  it("oyun sayısı gerçek veriden: sabit `4` yok", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="overlay" />);

    assert.ok(markup.includes("Henüz oyun bazlı ayar yok"));
    assert.equal(markup.includes("4 oyun için özel overlay ayarı var"), false);
  });

  it("kaldırılan atamalar satırı yerine tekil kısayol düzenleyicisini gösteriyor", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="shortcuts" />);

    assert.equal(markup.includes("1 çakışma"), false);
    assert.equal(markup.includes("Kısayol atamaları"), false);
    assert.ok(markup.includes('data-testid="settings-block-q2"'));
    assert.equal(markup.includes("Varsayılana sıfırla"), false);
    assertControlEnabled(markup, "setting-toggle-q1");
  });

  it("release kanalı segmenti kolonun `UAT` değerini `Beta` çipinde gösteriyor", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />);

    assert.ok(markup.includes("Beta"));
    assert.ok(markup.includes("Kararlı"));
  });

  it("başlangıç ve pencere kapanışı doğrudan ayar kontrollerini gösterir", () => {
    const app = render(<DesktopSection bootstrap={BOOTSTRAP} tab="app" />);
    const overlay = render(<DesktopSection bootstrap={BOOTSTRAP} tab="overlay" />);
    const updates = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />);

    assertControlEnabled(app, "setting-toggle-w1");
    assertControlEnabled(app, "setting-select-w2");

    for (const testId of ["setting-actions-z8-0", "setting-actions-z8-1", "setting-actions-z8-2"]) {
      assertControlDisabled(overlay, testId);
    }

    assertControlDisabled(updates, "setting-actions-h1-0");
    assert.doesNotMatch(updates, /data-testid="setting-toggle-h4"/);
    assert.doesNotMatch(updates, /data-testid="setting-actions-n4-0"/);
    assert.equal(updates.includes('data-testid="setting-actions-n4-2"'), false);
  });

  it("güncellemeyi denetler; yeni sürüm yokken kurulum düğmesi göstermez", () => {
    const snapshot: DesktopRuntimeSnapshot = {
      appInfo: {
        appVersion: "1.0.0",
        buildTime: "2026-09-10",
        releaseRing: "stable",
        tauriVersion: "2.11.5",
        updaterEnabled: true,
        webviewVersion: "140",
      },
      permissions: UNKNOWN_DESKTOP_PERMISSIONS,
      shortcuts: [],
      shortcutsEnabled: false,
      platform: "windows",
      surfaces: null,
    };
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />, snapshot);
    assertControlEnabled(markup, "setting-actions-h1-0");
    assert.doesNotMatch(markup, />Güncel</u);
    assert.ok(markup.includes("Güncellemeleri denetle"));
    assert.doesNotMatch(markup, /Dışa aktar/);
    assert.doesNotMatch(markup, /data-testid="setting-actions-h1-1"/);
  });
});

describe("AboutPage — tek sayfa", () => {
  it("tanıtım ve katkıcılar çiziliyor", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);

    for (const key of ["o1", "o6"]) {
      assert.ok(
        markup.includes(`data-setting-row="${key}"`) || markup.includes(`settings-block-${key}`),
        `${key} çizilmiyor`,
      );
    }
  });

  it("sürüm başlığı veriden interpolasyonla geliyor", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />);

    assert.ok(markup.includes("Yenilikler · 2.4.1"));
  });

  it("web'de masaüstü satırları `—` gösteriyor, gizlenmiyor", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />);

    assert.ok(markup.includes("Masaüstü sürümü"));
    assert.ok(markup.includes("Desktop release ring"));
    assert.ok(markup.includes("—"));
  });

  it("sekme şeridi yok", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);

    assert.equal(markup.includes('role="tablist"'), false);
  });

  it("güncelleme bilgileri Hakkında ekranından kaldırıldı", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);
    for (const key of ["o2", "o3", "o4", "o5", "h1"]) {
      assert.doesNotMatch(markup, new RegExp(`data-setting-row="${key}"|settings-block-${key}`));
    }
    const updates = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />);
    assert.match(updates, /data-testid="setting-nav-o5"/u);
    assert.doesNotMatch(updates, /data-testid="setting-nav-o5"[^>]*disabled/u);
    assert.ok(updates.includes("Sürüm bilgileri"));
  });
});
