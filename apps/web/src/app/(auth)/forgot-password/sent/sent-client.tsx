"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  AuthDescription,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PrimaryButton,
} from "@/components/auth/auth-screen";
import { AuthBanner } from "@/components/auth/auth-error-levels";
import { AuthCountdownPill, AuthSuccessTile } from "@/components/auth/auth-pieces";
import { useCountdown } from "@/components/auth/auth-status-view";
import { useI18n } from "@/components/providers/locale-provider";
import { useHydrated } from "@/hooks/use-hydrated";
import { resendPasswordResetAction, type AuthActionResult } from "@/lib/auth/actions";
import { readPendingResetRequest, type PendingResetRequest } from "@/lib/auth/pending-reset";

/**
 * SPEC-GIRIS-KAYIT §4.7 — `Bağlantı gönderildi` **ve** `Bağlantı yeniden gönderildi`.
 *
 * Tek rota, iki durum (K11). `Kodu tekrar gönder` basıldığında ekran tam olarak üç şeyi değiştirir:
 *
 * 1. Aurora'nın ikinci radyali `--success/.16`'ya yükselir.
 * 2. Açıklamanın altına hata bandıyla **birebir aynı yapıda**, success tonunda bir bant girer;
 *    karo glifi `↻` — `✓` değil, çünkü tik zaten ekranın üstünde duruyor.
 * 3. `Kodu tekrar gönder` bağlantısının yerini geri sayım pill'i alır. Sayaç bitince pill
 *    kaybolur ve bağlantı geri gelir.
 */
export function ForgotPasswordSentClient() {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending] = useState<PendingResetRequest | null>(readPendingResetRequest);
  const [resent, setResent] = useState(false);
  const [retryAfterMs, setRetryAfterMs] = useState<number | undefined>(() => pending?.retryAfterMs);
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (hydrated && !pending) {
      router.replace("/forgot-password");
    }
  }, [hydrated, pending, router]);

  const countdown = useCountdown(retryAfterMs, () => setRetryAfterMs(undefined));

  const onResend = useCallback(async () => {
    if (!pending || resending) {
      return;
    }

    setResending(true);
    const formData = new FormData();
    formData.set("email", pending.email);
    /*
     * Turnstile token'ı bu ekranda yok: kullanıcı zaten bir adım önce doğrulandı ve yeniden
     * gönderme sunucu tarafında 60 saniyelik kilit + hız sınırıyla korunuyor.
     */
    formData.set("turnstileToken", "");

    const actionResult = await resendPasswordResetAction(formData);
    setResending(false);
    setResent(true);
    setRetryAfterMs(actionResult.retryAfterMs);

    if (!actionResult.success) {
      setResult(actionResult);
    }
  }, [pending, resending]);

  if (!hydrated || !pending) {
    return null;
  }

  return (
    <AuthScreenLayout auroraTone={resent ? "success" : "default"}>
      <AuthSuccessTile />

      <div className="mt-[var(--auth-success-gap)]">
        <AuthTitle>{t("auth.forgotPassword.sentTitle")}</AuthTitle>
        <AuthDescription>
          {t("auth.forgotPassword.sentSubtitle", { email: pending.email })}
        </AuthDescription>
      </div>

      {resent ? (
        <div className="mt-[var(--auth-title-gap)]" data-testid="resent-banner">
          <AuthBanner
            body={t("auth.forgotPassword.resentSubtitle", { email: pending.email })}
            title={t("auth.forgotPassword.resentTitle")}
            tone="success"
          />
        </div>
      ) : null}

      {result && !result.success ? (
        <p className="auth-field-error mt-[var(--auth-label-gap)]" role="alert">
          {t("auth.status.rateLimit.title")}
        </p>
      ) : null}

      <div className="mt-[var(--auth-title-gap)]">
        <PrimaryButton onClick={() => window.open("mailto:", "_self")} type="button">
          {t("auth.forgotPassword.openMailApp")}
        </PrimaryButton>
      </div>

      <div className="mt-[var(--auth-title-gap)] flex flex-col items-center gap-[var(--auth-label-gap)]">
        {countdown.remainingMs > 0 ? (
          <AuthCountdownPill>
            {t("auth.forgotPassword.resendWait", { countdown: countdown.label })}
          </AuthCountdownPill>
        ) : (
          <button
            className="auth-link"
            data-testid="resend-reset-link"
            disabled={resending}
            onClick={onResend}
            type="button"
          >
            {t("auth.verifyEmail.resend")}
          </button>
        )}

        <AuthLink href="/login" size="small" tone="muted">
          {t("auth.common.backToLogin")}
        </AuthLink>
      </div>
    </AuthScreenLayout>
  );
}
