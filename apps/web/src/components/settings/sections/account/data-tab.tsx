"use client";

import { renderSettingsTab } from "@/components/settings/rows/render-settings-tab";

/**
 * Hesabım › Verilerim — dışa aktarma + tehlikeli bölge.
 */
export function AccountDataTab() {
  return renderSettingsTab("account", "data");
}
