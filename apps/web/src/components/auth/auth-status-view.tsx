"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { AuthBanner } from "@/components/auth/auth-error-levels";
import { useI18n } from "@/components/providers/locale-provider";
import { formatCountdown } from "@/lib/auth/countdown";
import { AUTH_STATUS_CATALOG, type AuthStatusId } from "@/lib/auth/status-catalog";

/**
 * Sunucu sonucundan ekrana — SPEC-GIRIS-KAYIT §8'in seviye eşlemesi.
 *
 * Üç ekran ailesi (giriş/2FA, kayıt, doğrulama-sıfırlama) aynı `AuthActionResult` sözleşmesini
 * okuyor. Seviye kararını ve geri sayım sayacını üç kez yazmak yerine tek yerde tutuluyor;
 * seviye bilgisi zaten `AUTH_STATUS_CATALOG` içinde.
 */

export type AuthResultLike = {
  attemptsLeft?: number;
  error?: string;
  reference?: string;
  retryAfterMs?: number;
  status?: AuthStatusId;
  success: boolean;
};

export function resolveAuthLevel(status: AuthStatusId | undefined) {
  return status ? AUTH_STATUS_CATALOG[status].level : null;
}

/** SPEC §8/2 — form üstü bant. Yalnız seviye 2 durumlar için çizilir. */
export function AuthLevelTwoBanner({ result }: { result: AuthResultLike | null }) {
  const { t } = useI18n();

  if (!result || result.success) {
    return null;
  }

  if (result.status && resolveAuthLevel(result.status) === 2) {
    const status = AUTH_STATUS_CATALOG[result.status];

    return (
      <AuthBanner
        body={t(status.descriptionKey)}
        title={t(status.titleKey)}
        tone={status.tone === "warning" ? "warning" : "danger"}
      />
    );
  }

  /*
   * Katalogda karşılığı olmayan bir hata anahtarı da kullanıcıya görünmek zorunda; aksi hâlde
   * form sessizce hiçbir şey yapmıyormuş gibi görünür.
   */
  if (!result.status && result.error) {
    return <AuthBanner title={t(result.error)} />;
  }

  return null;
}

/**
 * Canlı geri sayım. Sunucunun verdiği kalan süreden başlar ve saniyede bir düşer; bitince
 * `onComplete` çağrılır (pill kaybolur, bağlantı geri gelir — SPEC §4.7).
 */
export function useCountdown(retryAfterMs: number | undefined, onComplete?: () => void) {
  const [clock, setClock] = useState(() => ({
    remainingMs: retryAfterMs ?? 0,
    source: retryAfterMs,
  }));
  const remainingMs = clock.source === retryAfterMs ? clock.remainingMs : (retryAfterMs ?? 0);
  const complete = useEffectEvent(() => onComplete?.());

  useEffect(() => {
    if ((retryAfterMs ?? 0) <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setClock((current) => {
        const currentRemaining =
          current.source === retryAfterMs ? current.remainingMs : (retryAfterMs ?? 0);

        return {
          remainingMs: Math.max(0, currentRemaining - 1_000),
          source: retryAfterMs,
        };
      });
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [retryAfterMs]);

  useEffect(() => {
    if (clock.source === retryAfterMs && clock.remainingMs === 0 && (retryAfterMs ?? 0) > 0) {
      complete();
    }
  }, [clock.remainingMs, clock.source, retryAfterMs]);

  return { label: formatCountdown(remainingMs), remainingMs };
}
