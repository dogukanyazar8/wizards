"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import {
  AuthDescription,
  AuthEyebrow,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PrimaryButton,
} from "@/components/auth/auth-screen";
import { AuthCodeInput } from "@/components/auth/auth-code-input";
import { AuthCountdownPill } from "@/components/auth/auth-pieces";
import { AuthLevelTwoBanner, useCountdown } from "@/components/auth/auth-status-view";
import { useI18n } from "@/components/providers/locale-provider";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  resendEmailVerificationCodeAction,
  submitEmailVerificationCodeAction,
  type AuthActionResult,
} from "@/lib/auth/actions";
import { AUTH_METRICS } from "@/lib/auth/metrics";
import {
  clearPendingVerificationEmail,
  readPendingVerificationEmail,
} from "@/lib/auth/pending-verification";

/**
 * SPEC-GIRIS-KAYIT §4.5 — `E-postanı doğrula`.
 *
 * Kod altı hanelidir ve on dakika geçerlidir (K3). Aynı doğrulama e-postası hem bağlantıyı hem
 * kodu taşır; bağlantıyla gelen kullanıcı bu ekranı hiç görmez, `?token=` dalı sunucu tarafında
 * karşılanır.
 *
 * Adres sekmeden okunur — sorgu dizesine yazılmaz (kişisel veri).
 */
export function VerifyEmailClient({ next }: { next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const [storedEmail] = useState<string | null>(readPendingVerificationEmail);
  const email = hydrated ? storedEmail : null;
  const [code, setCode] = useState("");
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendRetryAfterMs, setResendRetryAfterMs] = useState<number | undefined>(undefined);

  const countdown = useCountdown(resendRetryAfterMs, () => setResendRetryAfterMs(undefined));
  const codeInvalid = result?.status === "codeInvalid";
  const codeExpired = result?.status === "linkExpired";

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!email) {
        return;
      }

      setSubmitting(true);
      setResult(null);

      const formData = new FormData();
      formData.set("code", code);
      formData.set("email", email);

      const actionResult = await submitEmailVerificationCodeAction(formData);
      setSubmitting(false);

      if (actionResult.success) {
        clearPendingVerificationEmail();
        router.replace(next);
        return;
      }

      setResult(actionResult);
    },
    [code, email, next, router],
  );

  const onResend = useCallback(async () => {
    if (!email) {
      return;
    }

    const formData = new FormData();
    formData.set("email", email);

    const actionResult = await resendEmailVerificationCodeAction(formData);
    setResendRetryAfterMs(actionResult.retryAfterMs);

    if (!actionResult.success) {
      setResult(actionResult);
    }
  }, [email]);

  return (
    <AuthScreenLayout auroraTone={codeInvalid || codeExpired ? "danger-field" : "default"}>
      <AuthEyebrow>{t("auth.verifyEmail.eyebrow")}</AuthEyebrow>
      <AuthTitle>{t("auth.verifyEmail.title")}</AuthTitle>
      <AuthDescription>{t("auth.verifyEmail.subtitle", { email: email ?? "" })}</AuthDescription>

      <form
        className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
        data-testid="verify-email-form"
        noValidate
        onSubmit={onSubmit}
      >
        <AuthLevelTwoBanner result={result} />

        <AuthCodeInput
          ariaLabel={t("auth.field.code")}
          onChange={setCode}
          tone={codeInvalid || codeExpired ? "danger" : undefined}
          value={code}
        />

        {codeInvalid || codeExpired ? (
          <p className="auth-field-error" data-testid="verify-email-error" role="alert">
            {t(codeExpired ? "auth.status.linkExpired.title" : "auth.status.codeInvalid.title")}
          </p>
        ) : null}

        <PrimaryButton
          disabled={code.length !== AUTH_METRICS.codeCell.count || submitting || !email}
          loading={submitting}
          type="submit"
        >
          {t("auth.verifyEmail.cta")}
        </PrimaryButton>
      </form>

      <div className="mt-[var(--auth-title-gap)] flex flex-col items-center gap-[var(--auth-label-gap)]">
        {countdown.remainingMs > 0 ? (
          <span className="auth-hint" data-testid="verify-email-wait">
            {t("auth.verifyEmail.wait", { countdown: countdown.label })}
          </span>
        ) : (
          <button
            className="auth-link"
            data-testid="verify-email-resend"
            onClick={onResend}
            type="button"
          >
            {t("auth.verifyEmail.resend")}
          </button>
        )}

        <AuthLink href="/register" size="small" tone="muted">
          {t("auth.verifyEmail.changeEmail")}
        </AuthLink>
      </div>

      {/* SPEC §7/9 — hız sınırında devre dışı düğme ve geri sayım pill'i. */}
      {result?.status === "rateLimit" && countdown.remainingMs > 0 ? (
        <div className="mt-[var(--auth-label-gap)] flex justify-center">
          <AuthCountdownPill>
            {t("auth.status.rateLimit.countdown", { countdown: countdown.label })}
          </AuthCountdownPill>
        </div>
      ) : null}
    </AuthScreenLayout>
  );
}
