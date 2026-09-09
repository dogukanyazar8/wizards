import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findSettingsTab, walkSettingsRows } from "@/lib/settings/tree";

import { getAccountSettingsSurface } from "./account-settings-surface";

/**
 * Ayarlar Ş13 — bu dosya eskiden `settings-panel.tsx`'in **kaynağını** okuyup satır başlıklarını
 * arıyordu. Panel silindi (K1) ve satırların tek kaynağı `SETTINGS_TREE` oldu; iddia bu yüzden
 * kaynak taramasından ağaç taramasına taşındı.
 *
 * Sözleşme değişmedi: Faz 5'in sunucuya bağlı hesap kontrollerinin hepsinin yeni ağaçta bir
 * karşılığı var ve hiçbiri sessizce kaybolmadı.
 */
describe("web account settings surface", () => {
  it("shows the Phase 5 server-backed account controls", () => {
    assert.deepEqual(getAccountSettingsSurface(), {
      preferences: ["language", "timeZone", "dateFormat", "timeFormat", "interfaceDensity"],
      privacy: ["profileVisibility", "presenceVisibility", "dmPolicy", "friendRequestPolicy"],
      security: ["email", "twoFactor", "recoveryCodes", "sessions"],
      data: ["export", "delete"],
    });
  });

  /**
   * Faz 5 kontrolü → Ş13 envanterindeki yeni satır. `interfaceDensity` Görünüm › Metin'e
   * taşındı (`m3`), kalan on üçü Hesabım'ın üç sekmesinde.
   */
  const SURFACE_ROWS: ReadonlyArray<readonly [string, string, string]> = [
    ["language", "account/privacy", "l1"],
    ["timeZone", "account/privacy", "l2"],
    ["dateFormat", "account/privacy", "l3"],
    ["timeFormat", "account/privacy", "l4"],
    ["interfaceDensity", "appearance/text", "m3"],
    ["profileVisibility", "account/privacy", "g1"],
    ["presenceVisibility", "account/privacy", "g2"],
    ["dmPolicy", "account/privacy", "g3"],
    ["friendRequestPolicy", "account/privacy", "g4"],
    ["email", "account/account", "ae"],
    ["twoFactor", "account/security", "s1"],
    ["recoveryCodes", "account/security", "s2"],
    ["sessions", "account/security", "o1"],
    ["export", "account/data", "d1"],
    ["delete", "account/data", "d3"],
  ];

  it("renders every Phase 5 account control as a row in the new tree", () => {
    // Anahtar tekil **değil**: `o1`/`o2` Hesabım › Güvenlik ile Hakkında'da aynı harfi
    // taşıyor (ağacın kendi notu). Aramanın çok değerli olması gerekiyor.
    const index = new Map<string, string[]>();

    for (const { row, section, tab } of walkSettingsRows()) {
      const locations = index.get(row.key) ?? [];

      locations.push(`${section.key}/${tab.key}`);
      index.set(row.key, locations);
    }

    const missing = SURFACE_ROWS.filter(
      ([, location, rowKey]) => !(index.get(rowKey) ?? []).includes(location),
    ).map(([control, location, rowKey]) => `${control} → ${location} (${rowKey})`);

    assert.deepEqual(missing, []);
  });

  it("keeps the time and region controls together in one group", () => {
    const privacy = findSettingsTab("account", "privacy");

    assert.ok(privacy);

    const group = privacy.groups.find((entry) => entry.rows.some((row) => row.key === "l2"));

    assert.ok(group);
    assert.deepEqual(
      group.rows.map((row) => row.key),
      ["l1", "l2", "l3", "l4"],
    );
  });
});
