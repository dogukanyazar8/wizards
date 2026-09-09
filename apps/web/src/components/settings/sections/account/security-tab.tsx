"use client";

import { renderSettingsTab } from "@/components/settings/rows/render-settings-tab";

/**
 * Hesabım › Güvenlik — giriş güvenliği, güvenlik günlüğü, aktif oturumlar.
 *
 * Üç riskli akıştan ikisi (`s1` 2FA, `d3` hesap silme) satırın altında açılır; gövdeleri
 * bölümün `riskyBodies` haritasından gelir ve aynı anda yalnız biri açık kalır (tuzak #12).
 */
export function AccountSecurityTab() {
  return renderSettingsTab("account", "security");
}
