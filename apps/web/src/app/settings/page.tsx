import { permanentRedirect } from "next/navigation";

import {
  DEFAULT_SETTINGS_ROUTE,
  buildSettingsHref,
  migrateLegacySettingsQuery,
} from "@/lib/settings/navigation";

/**
 * `/settings` — eski sorgu biçiminin göç kapısı (K2).
 *
 * `?section=…&panel=…` taşıyan her adres yeni yol segmentine **kalıcı** olarak yönlendirilir;
 * eşleşmeyen değer varsayılan rotaya düşer. Eşleme `migrateLegacySettingsQuery`'de: on dokuz
 * eski değerin karşılığı orada sayılı ve `navigation.test.ts` hepsini doğruluyor.
 *
 * Kalıcı yönlendirme `permanentRedirect` (308) ile verilir, 301 ile değil — deponun kendi
 * sözleşmesi bu (`app/(main)/channels/page.tsx`): 308 yöntemi korur, 301'i bazı istemciler
 * `GET`'e düşürür. Kalıcılık iddiası aynıdır, arama motorları ikisini de aynı okur.
 */
export default async function SettingsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value) && value[0] !== undefined) {
      params.set(key, value[0]);
    }
  }

  permanentRedirect(
    migrateLegacySettingsQuery(params) ??
      buildSettingsHref(DEFAULT_SETTINGS_ROUTE.section, DEFAULT_SETTINGS_ROUTE.tab),
  );
}
