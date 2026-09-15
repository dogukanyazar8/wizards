import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  AccountPrivacyTab,
  IDLE_TIMEOUT_ROW,
  withIdleTimeoutRow,
} from "@/components/settings/sections/account/privacy-tab";
import { getMessagesForLocale } from "@/lib/locale";
import { SPEC_DEVIATIONS } from "@/lib/settings/metrics";
import { findSettingsTab } from "@/lib/settings/tree";
import { SettingsValueContext, SettingsValueStore } from "@/lib/settings/use-setting-value";

/** Ş7 / K9 — `Boşta sayılma süresi` satırı Görünürlük grubunda. */

const MESSAGES: Record<string, string> = getMessagesForLocale("tr");

function render(): string {
  const store = new SettingsValueStore({ values: { g9: 2 }, write: async () => {} });

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <SettingsValueContext.Provider value={store}>
        <AccountPrivacyTab />
      </SettingsValueContext.Provider>
    </LocaleProvider>,
  );
}

describe("AccountPrivacyTab — K9", () => {
  it("Görünürlük grubu dört satır çiziyor (sapma #2'nin ürün sayısı)", () => {
    const base = findSettingsTab("account", "privacy");

    assert.ok(base);
    assert.equal(base.groups[0]?.rows.length, 3, "ağaçtaki referans sayısı");

    const augmented = withIdleTimeoutRow(base);

    assert.equal(augmented.groups[0]?.rows.length, 4);
    assert.equal(augmented.groups[0]?.rows.at(-1)?.key, "g9");
  });

  it("sapma kaydı bu farkı zaten taşıyor", () => {
    const record = SPEC_DEVIATIONS.find((entry) => entry.field === "privacy.visibility.rowCount");

    assert.deepEqual(record, { field: "privacy.visibility.rowCount", html: 3, spec: 4 });
  });

  it("mesaj ve istekler grubu dokunulmadan kalıyor", () => {
    const base = findSettingsTab("account", "privacy");

    assert.ok(base);

    const augmented = withIdleTimeoutRow(base);

    assert.deepEqual(
      augmented.groups.slice(1).map((group) => group.rows.length),
      base.groups.slice(1).map((group) => group.rows.length),
    );
  });

  it("satır elle çizilmiyor: motorun `SettingSelect`'i geliyor", () => {
    const markup = render();

    assert.ok(markup.includes('data-testid="setting-select-g9"'));
    assert.ok(markup.includes("Boşta sayılma süresi"));
    assert.ok(markup.includes("15 dk"), "kayıtlı süre seçili gelmeli");
  });

  it("beş seçenek ürünün boşta listesiyle aynı", () => {
    assert.deepEqual(
      [...(IDLE_TIMEOUT_ROW.options ?? [])].map((key) => MESSAGES[key]),
      ["5 dk", "10 dk", "15 dk", "30 dk", "60 dk"],
    );
  });

  it("aktif gruplar çiziliyor; kaldırılan içerik filtresi sunulmuyor", () => {
    const markup = render();

    for (const title of ["Görünürlük", "Mesaj ve istekler"]) {
      assert.ok(markup.includes(title), `${title} grubu yok`);
    }
    assert.ok(!markup.includes("Dil ve bölge"));
    assert.ok(!markup.includes("Hassas içerik filtresi"));
    assert.ok(!markup.includes("setting-select-g8"));
  });
});
