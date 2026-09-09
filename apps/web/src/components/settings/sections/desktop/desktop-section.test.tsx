import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { AboutPage } from "@/components/settings/sections/about/about-page";
import { getMessagesForLocale } from "@/lib/locale";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import { SETTINGS_TAB_COUNTS, findSettingsSection } from "@/lib/settings/tree";

import { DesktopSection } from "./desktop-section";

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

function render(node: React.ReactNode): string {
  // Sorgu istemcisi test başına yeni: bir sekmenin okuması diğerine sızmasın.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
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

    assert.equal(drawn, 23);
  });

  it("Masaüstü bölümü ağaçta yalnız masaüstünde listeleniyor", () => {
    const section = findSettingsSection("desktop");

    assert.equal(section?.desktopOnly, true);
    assert.equal(section?.tabs.length, SETTINGS_TAB_COUNTS.desktop);
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

  it("çakışma yokken `q3` sabit `1 çakışma` pili taşımıyor", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="shortcuts" />);

    assert.equal(markup.includes("1 çakışma"), false);
    assert.ok(markup.includes("Kısayol atamaları"));
    assert.ok(markup.includes("Masaüstü Denetimi&#x27;nde yönet"));
    assertControlDisabled(markup, "setting-toggle-q1");
  });

  it("release kanalı segmenti kolonun `UAT` değerini `Canary` çipinde gösteriyor", () => {
    const markup = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />);

    assert.ok(markup.includes("Canary"));
    assert.ok(markup.includes("Kararlı"));
  });

  it("uygulama başlangıcı ve pencere kapanışı güvenilir Desktop Control'e yönlenir", () => {
    const app = render(<DesktopSection bootstrap={BOOTSTRAP} tab="app" />);
    const overlay = render(<DesktopSection bootstrap={BOOTSTRAP} tab="overlay" />);
    const updates = render(<DesktopSection bootstrap={BOOTSTRAP} tab="updates" />);

    assertControlEnabled(app, "setting-actions-w1-0");
    assertControlEnabled(app, "setting-actions-w2-0");

    for (const testId of ["setting-actions-z8-0", "setting-actions-z8-1", "setting-actions-z8-2"]) {
      assertControlDisabled(overlay, testId);
    }

    for (const testId of [
      "setting-actions-h1-0",
      "setting-toggle-h4",
      "setting-actions-n4-0",
      "setting-actions-n4-1",
      "setting-actions-n4-2",
    ]) {
      assertControlDisabled(updates, testId);
    }
  });
});

describe("AboutPage — tek sayfa", () => {
  it("altı satırın hepsi çiziliyor", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);

    for (const key of ["o1", "o2", "o3", "o4", "o5", "o6"]) {
      assert.ok(
        markup.includes(`data-setting-row="${key}"`) || markup.includes(`settings-block-${key}`),
        `${key} çizilmiyor`,
      );
    }
  });

  it("sürüm başlığı veriden interpolasyonla geliyor", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);

    assert.ok(markup.includes("Yenilikler · 2.4.1"));
  });

  it("web'de masaüstü satırları `—` gösteriyor, gizlenmiyor", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);

    assert.ok(markup.includes("Masaüstü sürümü"));
    assert.ok(markup.includes("Desktop release ring"));
    assert.ok(markup.includes("—"));
  });

  it("sekme şeridi yok", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);

    assert.equal(markup.includes('role="tablist"'), false);
  });

  it("updater ve sürüm notu hedefi yokken eylemler kullanılamaz", () => {
    const markup = render(<AboutPage bootstrap={BOOTSTRAP} />);

    assertControlDisabled(markup, "setting-actions-o3-0");
    assertControlDisabled(markup, "setting-nav-o5");
  });
});
