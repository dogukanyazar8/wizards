"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { UserSettingsResponse } from "@/app/api/v1/users/me/settings/route";
import { fetchLayoutSettings, patchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";

/**
 * Ayarlar Ş12 §6 / K9 — "Boşta sayılma süresi".
 *
 * Kontrol kullanıcı barı menüsünden **çıktı** (menü tasarımdaki beş satıra sabit) ve
 * Ayarlar › Hesabım › Gizlilik › Görünürlük'e taşındı. Tercih ölmedi, yeri değişti.
 *
 * Kaynağı da değişti: eskiden `localStorage` idi, artık `UserSettings.idleTimeoutMinutes`
 * kolonu. Tarayıcı tercihi olarak kalsaydı aynı hesabın ikinci cihazı farklı bir süre
 * uygulardı ve Gizlilik sekmesindeki kayıt göstergesi hiçbir sunucu işini izlemezdi.
 *
 * Okuma `settingsQueryKeys.layout` üzerinden gider — bu sorguyu `SoundEffectsProvider` zaten
 * uygulama açılışında açıyor, yani buradaki okuma **yeni bir istek doğurmaz**.
 *
 * Eski yerel değer bir kez sunucuya taşınır ve anahtar silinir (§6). Göç yalnız yazma
 * başarılıysa anahtarı siler: başarısız bir PATCH'ten sonra anahtarı silmek, kullanıcının
 * seçtiği süreyi sessizce çöpe atardı.
 */

export const PRESENCE_IDLE_TIMEOUT_OPTIONS = [5, 10, 15, 30, 60] as const;
export const DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES = 15;

/** Ş12'den önce tercihin yaşadığı yer. Göç bittiğinde bu anahtar tarayıcıda kalmaz. */
export const LEGACY_PRESENCE_IDLE_TIMEOUT_STORAGE_KEY = "wizards.presence.idleTimeoutMinutes";

export function normalizeIdleTimeoutMinutes(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);

  return PRESENCE_IDLE_TIMEOUT_OPTIONS.includes(
    numericValue as (typeof PRESENCE_IDLE_TIMEOUT_OPTIONS)[number],
  )
    ? numericValue
    : DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES;
}

/**
 * Yerel anahtarın göç edip etmeyeceği kararı — saf, çünkü tek ilginç yanı budur.
 *
 * Anahtar yoksa göç yok. Anahtar varsa değeri normalize edilir ve sunucuya yazılacak sayı
 * odur; sunucudaki değere bakılmaz, çünkü yerel anahtar kullanıcının bu tarayıcıdaki **son
 * açık seçimidir** ve sunucudaki henüz varsayılandır.
 */
export function planIdleTimeoutMigration(storedValue: string | null): number | null {
  return storedValue === null ? null : normalizeIdleTimeoutMinutes(storedValue);
}

export type PresenceIdleTimeoutPreference = {
  readonly idleTimeoutMinutes: number;
  readonly setIdleTimeoutMinutes: (value: number) => void;
};

export function usePresenceIdleTimeoutPreference(): PresenceIdleTimeoutPreference {
  const queryClient = useQueryClient();
  const migratedRef = useRef(false);

  const settingsQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const idleTimeoutMinutes = normalizeIdleTimeoutMinutes(
    settingsQuery.data?.idleTimeoutMinutes ?? DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES,
  );

  const setIdleTimeoutMinutes = useCallback(
    (value: number) => {
      const normalizedValue = normalizeIdleTimeoutMinutes(value);

      queryClient.setQueryData<UserSettingsResponse | undefined>(
        settingsQueryKeys.layout,
        (current) => (current ? { ...current, idleTimeoutMinutes: normalizedValue } : current),
      );

      void patchLayoutSettings({ idleTimeoutMinutes: normalizedValue }).catch(() => {
        // Sunucu reddettiyse kutu sunucunun bildiğine döner; sahte bir "kaydedildi" bırakmayız.
        void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.layout });
      });
    },
    [queryClient],
  );

  useEffect(() => {
    if (migratedRef.current || typeof window === "undefined") {
      return;
    }

    const minutes = planIdleTimeoutMigration(
      window.localStorage.getItem(LEGACY_PRESENCE_IDLE_TIMEOUT_STORAGE_KEY),
    );

    if (minutes === null) {
      migratedRef.current = true;
      return;
    }

    migratedRef.current = true;
    void patchLayoutSettings({ idleTimeoutMinutes: minutes })
      .then(() => {
        window.localStorage.removeItem(LEGACY_PRESENCE_IDLE_TIMEOUT_STORAGE_KEY);
        queryClient.setQueryData<UserSettingsResponse | undefined>(
          settingsQueryKeys.layout,
          (current) => (current ? { ...current, idleTimeoutMinutes: minutes } : current),
        );
      })
      .catch(() => {
        // Anahtar duruyor; bir sonraki açılış göçü yeniden dener.
        migratedRef.current = false;
      });
  }, [queryClient]);

  return { idleTimeoutMinutes, setIdleTimeoutMinutes };
}
