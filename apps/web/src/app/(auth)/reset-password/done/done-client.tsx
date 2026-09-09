"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  AuthDescription,
  AuthEyebrow,
  AuthScreenLayout,
  AuthTitle,
  SecondaryButton,
} from "@/components/auth/auth-screen";
import { AuthInfoBand, AuthSuccessRing, AuthSuccessTile } from "@/components/auth/auth-pieces";
import { useI18n } from "@/components/providers/locale-provider";
import { clearPendingResetRequest } from "@/lib/auth/pending-reset";
import {
  clearResetOutcome,
  readResetOutcome,
  type ResetOutcome,
} from "@/lib/auth/pending-reset-outcome";

/**
 * SPEC-GIRIS-KAYIT §4.7 — `Şifren güncellendi`.
 *
 * Akışın **tek ortalanmış hizalı** ekranı; aurora ters çevrilir (birinci radyal `--success/.18`,
 * ikinci `--primary/.16`).
 *
 * Bilgi bandı gerçek sayıyla yazılır. Sayı sıfırsa bant **gösterilmez** — "0 cihazda oturum
 * kapatıldı" cümlesi hem yanlış hem anlamsız olurdu.
 */
export function ResetPasswordDoneClient() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const consumedRef = useRef<ResetOutcome | null>(null);
  const [outcome, setOutcome] = useState<ResetOutcome | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /*
     * Sonuç okunur okunmaz silinir (tek kullanımlık). Etki iki kez çalışırsa — StrictMode,
     * Fast Refresh ya da yeniden montaj — ikinci çalıştırma boş depoyu görüp kullanıcıyı
     * hak ettiği ekrandan atardı; bu yüzden okunan değer ref'te tutulur.
     */
    const stored = consumedRef.current ?? readResetOutcome();

    if (!stored) {
      // Bu ekrana yalnız başarılı bir güncellemeden sonra girilebilir.
      router.replace("/login");
      return;
    }

    consumedRef.current = stored;
    setOutcome(stored);
    setReady(true);
    clearPendingResetRequest();
    clearResetOutcome();
  }, [router]);

  if (!ready || !outcome) {
    return null;
  }

  const signedOutAt = new Date(outcome.signedOutAt);
  const dateLabel = signedOutAt.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeLabel = signedOutAt.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AuthScreenLayout align="center" auroraTone="success-final">
      <AuthSuccessRing>
        <AuthSuccessTile final />
      </AuthSuccessRing>

      <div className="mt-[var(--auth-success-gap)]">
        <AuthEyebrow>{t("auth.forgotPassword.eyebrow")}</AuthEyebrow>
        <AuthTitle>{t("auth.resetPassword.doneTitle")}</AuthTitle>
        <AuthDescription>{t("auth.resetPassword.doneSubtitle")}</AuthDescription>
      </div>

      {outcome.signedOutDeviceCount > 0 ? (
        <div className="mt-[var(--auth-title-gap)]" data-testid="reset-done-meta">
          <AuthInfoBand>
            {t("auth.resetPassword.doneMeta", {
              count: outcome.signedOutDeviceCount,
              date: dateLabel,
              time: timeLabel,
            })}
          </AuthInfoBand>
        </div>
      ) : null}

      <div className="mt-[var(--auth-title-gap)]">
        <SecondaryButton href="/login">{t("auth.login.cta")}</SecondaryButton>
      </div>

      <p className="auth-tip">{t("auth.resetPassword.doneTip")}</p>
    </AuthScreenLayout>
  );
}
