import type { SettingsGroupDef, SettingsRowDef, SettingsTabDef } from "@/lib/settings/tree";

import { DESKTOP_ROW_DATA_FIELDS } from "./desktop-settings-bridge";

/**
 * Ağaç tanımının çalışma zamanı türevi — Ş10.
 *
 * `lib/settings/tree.ts` bu şeritte **okunur, yazılmaz**. Ama iki satırın pili çalışma
 * zamanında bilinir ve ağaca yazılamaz:
 *
 * - `q3` (`Kısayol atamaları`) referansta `1 çakışma` pili taşıyor. Sabit `1` bir tasarım
 *   kararıydı, ürün gerçeği değil: çakışma sayısı işletim sisteminin kayıt cevabından çıkar ve
 *   sıfır olduğunda pil `danger` tonuyla durmamalı.
 * - `h1` (`Mevcut sürüm`) referansta `Güncel` pili taşıyor. Güncelleyici kontrol ederken ya da
 *   yeni sürüm bulduğunda o pil yalan söylerdi.
 *
 * Türev **eksiltmez**: satır sayısı, sırası ve anahtarları ağacınkiyle aynı kalır.
 */

export type DesktopTabDerivation = {
  /** Gerçek kayıt sonucundan sayılan çakışma; `0` pili düşürür. */
  readonly conflictCount: number;
  /** Güncelleyici bir sürüm bulduysa `Güncel` pili düşer. */
  readonly upToDate: boolean;
};

function deriveRow(row: SettingsRowDef, input: DesktopTabDerivation): SettingsRowDef {
  if (row.key === "q3") {
    if (input.conflictCount > 0) {
      return row;
    }

    // Çakışma yokken pil de ton da düşer; `badgeData` kalsa boş bir pil çizilirdi.
    const { badgeData, tone, ...rest } = row;

    return rest;
  }

  if (row.key === "h1" && !input.upToDate) {
    const { badgeKey, tone, ...rest } = row;

    return rest;
  }

  return row;
}

function deriveGroup(group: SettingsGroupDef, input: DesktopTabDerivation): SettingsGroupDef {
  return { ...group, rows: group.rows.map((row) => deriveRow(row, input)) };
}

export function deriveDesktopTab(tab: SettingsTabDef, input: DesktopTabDerivation): SettingsTabDef {
  return { ...tab, groups: tab.groups.map((group) => deriveGroup(group, input)) };
}

export { DESKTOP_ROW_DATA_FIELDS };
