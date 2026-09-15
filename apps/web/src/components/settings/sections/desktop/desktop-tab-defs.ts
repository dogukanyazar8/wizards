import type { SettingsGroupDef, SettingsRowDef, SettingsTabDef } from "@/lib/settings/tree";

import { DESKTOP_ROW_DATA_FIELDS } from "./desktop-settings-bridge";

/** The update badge follows the verified native updater state. */
export type DesktopTabDerivation = {
  /** Yalnız doğrulanmış güncel durumunda rozet gösterilir; null henüz bilinmiyor demektir. */
  readonly upToDate: boolean | null;
};

function deriveRow(row: SettingsRowDef, input: DesktopTabDerivation): SettingsRowDef {
  if (row.key === "h1" && input.upToDate !== true) {
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
