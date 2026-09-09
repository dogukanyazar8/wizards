import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { AccountAccountTab } from "@/components/settings/sections/account/account-tab";
import { AccountBadgesTab } from "@/components/settings/sections/account/badges-tab";
import { AccountDataTab } from "@/components/settings/sections/account/data-tab";
import { AccountProfileTab } from "@/components/settings/sections/account/profile-tab";
import { AccountSection } from "@/components/settings/sections/account/account-section";
import { AccountSecurityTab } from "@/components/settings/sections/account/security-tab";
import { getMessagesForLocale } from "@/lib/locale";
import { findSettingsSection } from "@/lib/settings/tree";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  type SettingsRowRuntime,
} from "@/lib/settings/use-setting-value";

/** Ş7 — altı sekme, 35 satır, elle satır markup'ı **yok**. */

const MESSAGES = getMessagesForLocale("tr");
const SECTION_DIR = fileURLToPath(new URL(".", import.meta.url));

const TABS = {
  account: AccountAccountTab,
  badges: AccountBadgesTab,
  data: AccountDataTab,
  profile: AccountProfileTab,
  security: AccountSecurityTab,
} as const;

function render(Tab: () => React.ReactNode, runtime: Partial<SettingsRowRuntime> = {}): string {
  const store = new SettingsValueStore({ write: async () => {} });
  const full: SettingsRowRuntime = {
    data: {},
    disabledRows: {},
    onAction: () => {},
    onJump: () => {},
    onNavigate: () => {},
    onSoundPreview: () => {},
    openRisky: null,
    openSelect: null,
    riskyBodies: {},
    setOpenRisky: () => {},
    setOpenSelect: () => {},
    ...runtime,
  };

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <SettingsValueContext.Provider value={store}>
        <SettingsRowRuntimeContext.Provider value={full}>
          <Tab />
        </SettingsRowRuntimeContext.Provider>
      </SettingsValueContext.Provider>
    </LocaleProvider>,
  );
}

function renderSection(tabKey: string): string {
  const section = findSettingsSection("account");
  const tab = section?.tabs.find((entry) => entry.key === tabKey);

  assert.ok(section);
  assert.ok(tab);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
        <AccountSection
          input={{
            openRisky: null,
            openSelect: null,
            section,
            tab,
            toggleRisky: () => {},
            toggleSelect: () => {},
          }}
        />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function assertDisabled(markup: string, testId: string): void {
  const tag = markup.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`, "u"))?.[0];

  assert.ok(tag, `${testId} çizilmedi`);
  assert.match(tag, /(?:aria-disabled="true"|disabled="")/u, `${testId} etkileşime açık`);
}

describe("Hesabım — sayım", () => {
  it("ağaç altı sekme, on beş grup ve otuz beş satır taşıyor", () => {
    const section = findSettingsSection("account");

    assert.ok(section);
    assert.equal(section.tabs.length, 6);
    assert.equal(
      section.tabs.reduce((total, tab) => total + tab.groups.length, 0),
      15,
    );
    assert.equal(
      section.tabs.reduce(
        (total, tab) => total + tab.groups.reduce((sum, group) => sum + group.rows.length, 0),
        0,
      ),
      35,
    );
  });

  it("beş sekme ağaçtaki satırlarının hepsini çiziyor", () => {
    const section = findSettingsSection("account");

    assert.ok(section);

    for (const [key, Tab] of Object.entries(TABS)) {
      const markup = render(Tab);
      const tab = section.tabs.find((entry) => entry.key === key);

      assert.ok(tab, `${key} sekmesi ağaçta yok`);

      for (const group of tab.groups) {
        for (const row of group.rows) {
          assert.ok(
            markup.includes(`data-setting-row="${row.key}"`),
            `${key}/${row.key} çizilmemiş`,
          );
        }
      }
    }
  });
});

describe("Hesabım — motor sözleşmesi", () => {
  it("sekme dosyaları satır markup'ı yazmıyor", () => {
    const files = readdirSync(SECTION_DIR).filter((name) => name.endsWith("-tab.tsx"));

    assert.equal(files.length, 6);

    for (const file of files) {
      const source = readFileSync(`${SECTION_DIR}${file}`, "utf8");

      for (const forbidden = /<Setting(Row|Toggle|Select|Segment|Slider|Input|Textarea)/u; ;) {
        assert.ok(!forbidden.test(source), `${file} motoru atlıyor`);
        break;
      }
    }
  });

  it("K5 — telefon satırının düğmeleri bölüm haritasıyla kapanıyor", () => {
    const markup = render(TABS.account, { disabledRows: { ae: true, ae2: true, ap: true } });

    assert.match(markup, /setting-actions-ap-0"[^>]*disabled/u);
    assert.match(markup, /setting-actions-ap-1"[^>]*disabled/u);
    assert.match(markup, /setting-actions-ae-0"[^>]*disabled/u);
  });

  it("bölüm haritası olmadan düğmeler açık kalır (motor kendi kararını vermez)", () => {
    const markup = render(TABS.account);

    assert.ok(!/setting-actions-ap-0"[^>]*disabled/u.test(markup));
  });

  it("riskli gövde satırın altında, aynı anda tek blok", () => {
    const markup = render(TABS.security, {
      openRisky: "s1",
      riskyBodies: { s1: <p>iki aşamalı gövde</p> },
    });

    assert.ok(markup.includes('data-testid="setting-risky-body-s1"'));
    assert.ok(markup.includes("iki aşamalı gövde"));
    assert.ok(!markup.includes('data-testid="setting-risky-body-apw"'));
  });

  it("veri sözlüğü satır alt metnini dolduruyor", () => {
    const markup = render(TABS.security, {
      data: { recoveryCodes: "10 kod · 8 tanesi kullanılmadı", sessionCount: "3 oturum açık." },
    });

    assert.ok(markup.includes("10 kod · 8 tanesi kullanılmadı"));
    assert.ok(markup.includes("3 oturum açık."));
  });
});

describe("Hesabım — gerçek kullanılabilirlik", () => {
  it("web yazma yolu olmayan profil ve gizlilik tercihleri etkileşime kapalı", () => {
    const profile = renderSection("profile");
    const privacy = renderSection("privacy");

    for (const testId of [
      "setting-input-pz",
      "setting-textarea-pbio",
      "setting-input-ps",
      "setting-select-pe",
      "setting-select-px",
    ]) {
      assertDisabled(profile, testId);
    }

    for (const testId of ["setting-toggle-g6", "setting-toggle-g7", "setting-select-g8"]) {
      assertDisabled(privacy, testId);
    }
  });
});
