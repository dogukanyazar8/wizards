import type { NotifPermission } from "@wizards/types";

import type { SettingsGroupDef, SettingsRowDef, SettingsTabDef } from "@/lib/settings/tree";

import type { QuietTimeZoneOption } from "./notification-prefs-bridge";

/**
 * Ayarlar paketi — Dalga 3 / Ş9. Ağaç tanımının çalışma zamanı türevi.
 *
 * `lib/settings/tree.ts` bu şeritte **okunur, yazılmaz**: 169 satırın tek kaynağı odur ve dört
 * bölüm şeridi aynı anda çalışıyor. Ama üç satırın seçenekleri ya da alt metni çalışma
 * zamanında bilinir — 48 yarım saat, hesabın zaman dilimi, izin durumu — ve bunlar ağaca
 * yazılabilecek şeyler değil. Türev burada üretilir; motor (`SettingsTabBody`) herhangi bir
 * `SettingsTabDef` çizebildiği için satır markup'ı yine yazılmaz.
 *
 * Türev **eksiltmez**: satır sayısı, sırası ve anahtarları ağacınkiyle aynı kalır. Değişen tek
 * şey üç alandır — `options`, `descriptionKey → descriptionData`, ve iznin durumuna göre
 * `badgeKey` / `tone`.
 */

/** `runtime.data` alan adları — ağaçtaki `descriptionData` bunları işaret eder. */
export const NOTIFICATION_ROW_DATA_FIELDS = {
  quietHoursRange: "quietHoursRange",
  quietHoursRangeSecure: "quietHoursRangeSecure",
} as const;

const QUIET_HOURS_SHORT_DESCRIPTION_KEY = "settings.row.nq1.descriptionShort";

export type NotificationsTabDerivation = {
  /**
   * Çalışma zamanının bildirdiği izin. Ağaç `na5`'i referansın durumuyla (`Engellendi`,
   * `danger`) taşıyor; izin verilmişse pil ve tehlike zemini **düşürülür**.
   *
   * Pil yerine başka bir metin yazılmıyor: `Engellendi` dışındaki durumların referansta
   * karşılığı yok ve olmayan bir metni uydurmak, kopya sözleşmesini tek taraflı bozmak olurdu
   * (bkz. rapor §"Açık uçlar").
   */
  readonly permission: NotifPermission;
  readonly quietHourOptions: readonly string[];
  readonly quietTimeZoneOptions: readonly QuietTimeZoneOption[];
};

function deriveRow(row: SettingsRowDef, input: NotificationsTabDerivation): SettingsRowDef {
  if (row.key === "nq2" || row.key === "nq3") {
    return { ...row, options: input.quietHourOptions };
  }

  if (row.key === "nq4") {
    return { ...row, options: input.quietTimeZoneOptions.map((option) => option.labelKey) };
  }

  if (row.key === "nq1") {
    const { descriptionKey, ...rest } = row;

    return {
      ...rest,
      descriptionData:
        descriptionKey === QUIET_HOURS_SHORT_DESCRIPTION_KEY
          ? NOTIFICATION_ROW_DATA_FIELDS.quietHoursRange
          : NOTIFICATION_ROW_DATA_FIELDS.quietHoursRangeSecure,
    };
  }

  if (row.key === "na5" && input.permission !== "denied") {
    const { badgeKey, tone, ...rest } = row;

    return rest;
  }

  return row;
}

function deriveGroup(group: SettingsGroupDef, input: NotificationsTabDerivation): SettingsGroupDef {
  return { ...group, rows: group.rows.map((row) => deriveRow(row, input)) };
}

export function deriveNotificationsTab(
  tab: SettingsTabDef,
  input: NotificationsTabDerivation,
): SettingsTabDef {
  return { ...tab, groups: tab.groups.map((group) => deriveGroup(group, input)) };
}
