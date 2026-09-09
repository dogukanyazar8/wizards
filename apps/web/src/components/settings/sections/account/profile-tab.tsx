"use client";

import { renderSettingsTab } from "@/components/settings/rows/render-settings-tab";

/**
 * Hesabım › Profil — hero + Kimlik + Durum.
 *
 * Satır markup'ı **yok**: dokuz satırın hepsi `SETTINGS_TREE`'den doğuyor, hero ise özel blok
 * kayıt defterinden (`SETTINGS_BLOCKS.hero`). Sekme dosyası bundan uzun olursa motor atlanmış
 * demektir (Ş6 §8).
 */
export function AccountProfileTab() {
  return renderSettingsTab("account", "profile");
}
