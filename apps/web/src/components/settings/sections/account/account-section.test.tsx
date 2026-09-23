import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { settingsQueryKeys } from "@/lib/settings/client";
import { SETTINGS_TEST_BOOTSTRAP } from "@/lib/settings/read-test-fixtures";
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
import { findSettingsSection, type SettingsRiskyBlockKey } from "@/lib/settings/tree";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  type SettingsRowRuntime,
} from "@/lib/settings/use-setting-value";

/** Account tabs render rows through the shared settings engine. */

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
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
        <SettingsValueContext.Provider value={store}>
          <SettingsRowRuntimeContext.Provider value={full}>
            <Tab />
          </SettingsRowRuntimeContext.Provider>
        </SettingsValueContext.Provider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function renderSection(
  tabKey: string,
  openRisky: SettingsRiskyBlockKey | null = null,
  twoFactorEnabled = false,
): string {
  const section = findSettingsSection("account");
  const tab = section?.tabs.find((entry) => entry.key === tabKey);

  assert.ok(section);
  assert.ok(tab);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  if (tabKey === "account" || tabKey === "security") {
    queryClient.setQueryData(settingsQueryKeys.bootstrap, {
      ...SETTINGS_TEST_BOOTSTRAP,
      initialAccount: { ...SETTINGS_TEST_BOOTSTRAP.initialAccount, twoFactorEnabled },
    });
    queryClient.setQueryData(["account-contact", SETTINGS_TEST_BOOTSTRAP.initialAccount.id], {
      phone: null,
      hasPassword: true,
      googleAvailable: false,
      twoFactorEnabled: false,
    });
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
        <AccountSection
          input={{
            openRisky,
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

it("kabuktaki password durumu gerçek parola alanlarını açar", () => {
  const markup = renderSection("account", "password");
  for (const field of ["current", "next", "confirm"]) {
    assert.ok(markup.includes(`data-testid="settings-password-${field}"`));
  }
  assert.ok(!renderSection("account").includes('data-testid="settings-password-current"'));
});

it("hesap bölümü iletişim formunu ilgili satırın altında sunar, dialog üretmez", () => {
  for (const [kind, row] of [
    ["email", "ae"],
    ["phone", "ap"],
  ] as const) {
    const markup = renderSection("account", kind);
    assert.match(
      markup,
      new RegExp(
        `id="setting-risky-${row}"[^>]*><form[^>]*data-testid="settings-contact-form-${kind}"`,
        "u",
      ),
    );
    assert.ok(markup.includes('data-testid="settings-contact-value"'));
    assert.ok(!markup.includes('role="dialog"'));
    assert.equal(markup.match(/<form/gu)?.length, 1);
  }
});

describe("Hesabım — sayım", () => {
  it("ağaç altı sekme, on üç grup ve yirmi yedi satır taşıyor", () => {
    const section = findSettingsSection("account");

    assert.ok(section);
    assert.equal(section.tabs.length, 6);
    assert.equal(
      section.tabs.reduce((total, tab) => total + tab.groups.length, 0),
      13,
    );
    assert.equal(
      section.tabs.reduce(
        (total, tab) => total + tab.groups.reduce((sum, group) => sum + group.rows.length, 0),
        0,
      ),
      27,
    );
  });

  it("beş sekme ağaçtaki satırlarının hepsini çiziyor", () => {
    const section = findSettingsSection("account");

    assert.ok(section);

    for (const [key, Tab] of Object.entries(TABS)) {
      const markup = render(Tab);
      // Node 26's assert types make the narrowed `section` circular here unless the
      // lookup result carries its own annotation.
      const tab: (typeof section.tabs)[number] | undefined = section.tabs.find(
        (entry) => entry.key === key,
      );

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
      openRisky: "twoFactor",
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
  it("enabled two-factor shows an active badge and exposes recovery actions", () => {
    const markup = renderSection("security", null, true);
    assert.match(markup, />Aktif</u);
    assert.match(markup, /color:hsl\(var\(--success\)\)/u);
    assert.doesNotMatch(markup, />Kur<\/button>/u);
    assert.match(markup, />2FA&#x27;yı kapat<\/button>/u);
    const actions = markup.match(/<button[^>]+data-testid="setting-actions-s2-\d"[^>]*>/gu) ?? [];
    assert.equal(actions.length, 3);
    assert.ok(actions.every((button) => !button.includes(' disabled=""')));
  });

  it("kayıtlı değerler yüklenmeden varsayılan profil/gizlilik kontrolleri gösterilmez", () => {
    const profile = renderSection("profile");
    const privacy = renderSection("privacy");

    for (const testId of [
      "setting-textarea-pbio",
      "setting-input-ps",
      "profile-status-emoji",
      "setting-select-px",
    ]) {
      assert.ok(!profile.includes(`data-testid="${testId}"`));
    }

    for (const testId of ["setting-toggle-g6", "setting-toggle-g7"]) {
      assert.ok(!privacy.includes(`data-testid="${testId}"`));
    }
    assert.match(profile, /data-testid="settings-skeleton"/u);
    assert.match(privacy, /data-testid="settings-skeleton"/u);
  });
});
