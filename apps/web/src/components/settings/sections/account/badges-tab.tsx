"use client";

import { renderSettingsTab } from "@/components/settings/rows/render-settings-tab";

/**
 * Hesabım › Rozetler.
 *
 * Grup başlığı (`9 / 16 rozet kazanıldı`) ağaçta `titleData: "badgeProgress"`; sayıyı bölüm
 * gerçek katalogdan üretiyor, ızgarayı `SETTINGS_BLOCKS.badges` çiziyor.
 */
export function AccountBadgesTab() {
  return renderSettingsTab("account", "badges");
}
