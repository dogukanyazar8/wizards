"use client";

import { renderSettingsTab } from "@/components/settings/rows/render-settings-tab";

/**
 * Hesabım › Hesap — İletişim bilgileri + Bağlı hesaplar.
 *
 * E-posta ve telefon düzenleme ortak web/masaüstü iletişim akışını açar.
 * Telefon doğrulaması ve bağlı hesap ekleme henüz kullanılamaz.
 */
export function AccountAccountTab() {
  return renderSettingsTab("account", "account");
}
