"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  clearTwoFactorChallenge,
  readTwoFactorChallenge,
  type PendingTwoFactorChallenge,
} from "@/app/(auth)/login/challenge-transport";
import {
  AuthCheckbox,
  AuthDescription,
  AuthEyebrow,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PrimaryButton,
} from "@/components/auth/auth-screen";
import { AuthCodeInput } from "@/components/auth/auth-code-input";
import { AuthBlockingPanel } from "@/components/auth/auth-error-levels";
import { AuthLevelTwoBanner, useCountdown } from "@/components/auth/auth-status-view";
import { useI18n } from "@/components/providers/locale-provider";
import { useHydrated } from "@/hooks/use-hydrated";
import { submitTwoFactorCodeAction } from "@/lib/auth/two-factor-login-actions";
import type { AuthActionResult } from "@/lib/auth/actions";
import { AUTH_METRICS } from "@/lib/auth/metrics";

/**
 * SPEC-GIRIS-KAYIT §4.2 — `Doğrulama kodunu gir`.
 *
 * Altıncı hane girildiğinde form **otomatik gönderilmez**; düğme etkinleşir. Yanlış kod altı
 * hücreyi kırmızıya çevirir ve kalan deneme sayısını gösterir. Challenge düştüyse (süre doldu ya
 * da üç yanlış) kullanıcı giriş ekranına döner.
 */
export function TwoFactorClient({ callbackUrl }: { callbackUrl: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const [challenge] = useState<PendingTwoFactorChallenge | null>(readTwoFactorChallenge);
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [result, setResult] = useState<AuthActionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && !challenge) {
      router.replace("/login");
    }
  }, [challenge, hydrated, router]);

  const lockCountdown = useCountdown(
    result?.status === "accountLocked" ? result.retryAfterMs : undefined,
  );

  if (!hydrated || !challenge) {
    return null;
  }

  const codeInvalid = result?.status === "codeInvalid";
  const locked = result?.status === "accountLocked";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    const formData = new FormData();
    formData.set("callbackUrl", callbackUrl);
    formData.set("challengeId", challenge.challengeId);
    formData.set("code", code);
    formData.set("rememberDevice", rememberDevice ? "true" : "false");

    const actionResult = await submitTwoFactorCodeAction(formData);
    setSubmitting(false);

    if (actionResult.success) {
      clearTwoFactorChallenge();
      router.replace(callbackUrl);
      return;
    }

    setResult(actionResult);

    /*
     * `codeInvalid` + kalan deneme yoksa challenge düşmüştür (süre doldu ya da üçüncü yanlış).
     * Kullanıcıyı boş bir ekranda bırakmak yerine girişe döndürüyoruz.
     */
    if (actionResult.status === "codeInvalid" && actionResult.attemptsLeft === undefined) {
      clearTwoFactorChallenge();
      router.replace("/login");
    }
  };

  return (
    <AuthScreenLayout
      auroraTone={locked ? "danger-block" : codeInvalid ? "danger-field" : "default"}
    >
      {locked ? (
        <AuthBlockingPanel
          band={
            <span data-testid="two-factor-lock-countdown">
              {t("auth.status.accountLocked.countdown", { countdown: lockCountdown.label })}
            </span>
          }
          primaryAction={
            <PrimaryButton onClick={() => router.push("/forgot-password")} type="button">
              {t("auth.status.accountLocked.action")}
            </PrimaryButton>
          }
          secondaryAction={
            <AuthLink href="/login" tone="muted">
              {t("auth.common.backToLogin")}
            </AuthLink>
          }
          statusId="accountLocked"
        />
      ) : (
        <>
          <AuthEyebrow>{t("auth.twoFactor.eyebrow")}</AuthEyebrow>
          <AuthTitle>{t("auth.twoFactor.title")}</AuthTitle>
          <AuthDescription>{t("auth.twoFactor.subtitle")}</AuthDescription>

          <form
            className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
            data-testid="two-factor-form"
            noValidate
            onSubmit={onSubmit}
          >
            <AuthLevelTwoBanner result={result} />

            <AuthCodeInput
              ariaLabel={t("auth.field.code")}
              onChange={setCode}
              tone={codeInvalid ? "danger" : undefined}
              value={code}
            />

            {codeInvalid ? (
              <p className="auth-field-error" data-testid="two-factor-error" role="alert">
                {t("auth.status.codeInvalid.title")}
              </p>
            ) : null}

            <AuthCheckbox
              checked={rememberDevice}
              label={t("auth.twoFactor.rememberDevice")}
              onChange={(event) => setRememberDevice(event.target.checked)}
            />

            <PrimaryButton
              disabled={code.length !== AUTH_METRICS.codeCell.count || submitting}
              loading={submitting}
              type="submit"
            >
              {t("auth.twoFactor.cta")}
            </PrimaryButton>
          </form>

          <div className="mt-[var(--auth-title-gap)] flex flex-col items-center gap-[var(--auth-label-gap)]">
            <AuthLink href="/login/backup-code" size="small">
              {t("auth.twoFactor.useBackup")}
            </AuthLink>
            <AuthLink
              href="/login"
              onClick={() => clearTwoFactorChallenge()}
              size="small"
              tone="muted"
            >
              {t("auth.common.backToLogin")}
            </AuthLink>
          </div>
        </>
      )}
    </AuthScreenLayout>
  );
}
