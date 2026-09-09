"use client";

import { renderSettingsTab } from "@/components/settings/rows/render-settings-tab";

/**
 * Hesabım › Hesap — İletişim bilgileri + Bağlı hesaplar.
 *
 * Telefon satırı (`ap`) ve dört bağlı hesap satırı `disabled`: SMS sağlayıcı ve dört OAuth
 * uygulaması yok (K5). Kapatma kararı bölümün `disabledRows` haritasında, satırın kendisinde
 * değil — ağaç bir yeteneği değil, içeriği tarif ediyor.
 */
export function AccountAccountTab() {
  return renderSettingsTab("account", "account");
}
