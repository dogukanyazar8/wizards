"use client";

import React, { useMemo } from "react";

import { SettingsTabBody } from "@/components/settings/rows/render-settings-tab";
import { findSettingsTab, type SettingsRowDef, type SettingsTabDef } from "@/lib/settings/tree";

/**
 * Hesabım › Gizlilik — Görünürlük · Mesaj ve istekler · İçerik · Dil ve bölge.
 *
 * ## K9 — `Boşta sayılma süresi`
 *
 * Karar (00 §3, K9) tercihi kullanıcı barı menüsünden alıp **Görünürlük** grubuna satır olarak
 * indiriyor; sözlükteki sapma kaydı da bunu söylüyor (`privacy.visibility.rowCount` html 3,
 * ürün 4). Ama satır `SETTINGS_TREE`'ye **girmedi** ve ağaç bu şeridin "okunur, yazılmaz"
 * listesinde: `tree.ts`'e bir satır eklemek `tree.test.ts`'in 35/169 sayımını ve
 * `settings-screen-copy.test.ts`'in referans `SET` ile satır satır hizalamasını da değiştirmeyi
 * gerektiriyor — üçü de başka şeritlerin dosyası.
 *
 * Bu yüzden satır **burada**, çizim anında gruba ekleniyor: motor onu diğer 169 satırla aynı
 * `SettingSelect` olarak çiziyor (elle satır markup'ı yok), kalıcı yeri ise ağaçtır.
 * Ş13 için hazır yama raporda (`08-s7-rapor.md` §3).
 *
 * Satırın kaynağı bir tarayıcı tercihi (`usePresenceIdleTimeoutPreference`), sunucu kolonu yok;
 * bölüm onu `splitAccountPatch` üzerinden yerel tercihe yazıyor.
 */

/** K9 satırı — beş seçenek, `PRESENCE_IDLE_TIMEOUT_OPTIONS` sırasıyla (5 · 10 · 15 · 30 · 60 dk). */
export const IDLE_TIMEOUT_ROW: SettingsRowDef = {
  defaultValue: 2,
  descriptionKey: "settings.row.g9.description",
  key: "g9",
  options: [
    "settings.option.g9.1",
    "settings.option.g9.2",
    "settings.option.g9.3",
    "settings.option.g9.4",
    "settings.option.g9.5",
  ],
  titleKey: "settings.row.g9.title",
  type: "select",
};

/** Görünürlük grubunun **sonuna** eklenir; `g1` ve `g2`'nin sırası bozulmaz. */
export function withIdleTimeoutRow(tab: SettingsTabDef): SettingsTabDef {
  return {
    ...tab,
    groups: tab.groups.map((group, index) =>
      index === 0 ? { ...group, rows: [...group.rows, IDLE_TIMEOUT_ROW] } : group,
    ),
  };
}

export function AccountPrivacyTab() {
  const tab = useMemo(() => {
    const definition = findSettingsTab("account", "privacy");
    return definition ? withIdleTimeoutRow(definition) : null;
  }, []);

  if (!tab) {
    return null;
  }

  return <SettingsTabBody tab={tab} />;
}
