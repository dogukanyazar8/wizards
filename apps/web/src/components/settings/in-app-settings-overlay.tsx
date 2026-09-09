"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_SETTINGS_ROUTE, buildSettingsHref } from "@/lib/settings/navigation";

type InAppSettingsOverlayProps = {
  onClose: () => void;
  open: boolean;
};

/**
 * Kabuk ile Ayarlar rotası arasındaki köprü — Ş5 §1.
 *
 * Artık **hiçbir şey çizmez** ve kendi durumunu tutmaz. K2'den sonra pencere bir rotadır:
 * kabuktaki "Ayarlar" isteği `/settings/account/profile`'a gezinir, `(main)/@modal` onu yakalar
 * ve pencereyi kabuğun üstüne koyar. Adres çubuğu doğruyu söyler, geri tuşu pencereyi kapatır.
 *
 * `open` bir görünürlük bayrağı değil, bir **istek**: görüldüğü anda gezinilir ve kabuğun
 * bayrağı hemen sıfırlanır. Aksi hâlde kullanıcı pencereyi geri tuşuyla kapattığında kabuk
 * hâlâ "ayarlar açık" sanır ve gövde kaydırma kilidi asılı kalırdı.
 *
 * Prop sözleşmesi bilinçli olarak korundu: `wizards-shell.tsx` bu şeritte **değişmez**
 * (kapsam sınırı §1) ve kabuğun tek dokunulacak noktası Ş12'nin kullanıcı barı dişlisidir.
 */
export function InAppSettingsOverlay({ onClose, open }: InAppSettingsOverlayProps) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    router.push(buildSettingsHref(DEFAULT_SETTINGS_ROUTE.section, DEFAULT_SETTINGS_ROUTE.tab));
    onClose();
  }, [onClose, open, router]);

  return null;
}
