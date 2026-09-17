"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ResetPasswordSchema,
  evaluatePasswordStrength,
  meetsPasswordPolicy,
  type ResetPasswordInput,
} from "@wizards/types";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  AuthDescription,
  AuthEyebrow,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PasswordInput,
  PrimaryButton,
  SecondaryButton,
} from "@/components/auth/auth-screen";
import { AuthBlockingPanel } from "@/components/auth/auth-error-levels";
import { AuthPasswordStrength } from "@/components/auth/auth-password-strength";
import { AuthLevelTwoBanner } from "@/components/auth/auth-status-view";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { resetPasswordAction, type AuthActionResult } from "@/lib/auth/actions";
import { storeResetOutcome } from "@/lib/auth/pending-reset-outcome";

/**
 * SPEC-GIRIS-KAYIT §4.7 — `Yeni şifre belirle`.
 *
 * İki alan (K10: tekrar alanı burada **kalır**), altında hesap oluşturma ekranındakiyle aynı güç
 * göstergesi ve 2×2 kural listesi. Token geçersiz ya da süresi geçmişse form gizlenir ve seviye 3
 * blok gelir (SPEC §7/8).
 */

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const EXPIRED_ERROR_KEYS = new Set([
  "auth.passwordReset.expiredToken",
  "auth.passwordReset.invalidToken",
]);

export function ResetPasswordClient({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [result, setResult] = useState<AuthActionResult | null>(null);

  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm<ResetPasswordInput>({
    defaultValues: { confirmPassword: "", password: "", token, turnstileToken: "" },
    resolver: zodResolver(ResetPasswordSchema),
  });

  const password = useWatch({ control, name: "password" }) ?? "";
  const confirmPassword = useWatch({ control, name: "confirmPassword" }) ?? "";
  const turnstileToken = useWatch({ control, name: "turnstileToken" }) ?? "";
  const strength = evaluatePasswordStrength(password);

  const handleTurnstileTokenChange = useCallback(
    (nextToken: string) => {
      setValue("turnstileToken", nextToken, {
        shouldDirty: true,
        shouldValidate: Boolean(nextToken),
      });
    },
    [setValue],
  );

  const onSubmit = async (values: ResetPasswordInput) => {
    setResult(null);

    const formData = new FormData();
    formData.set("confirmPassword", values.confirmPassword);
    formData.set("password", values.password);
    formData.set("token", values.token);
    formData.set("turnstileToken", values.turnstileToken);

    const actionResult = await resetPasswordAction(formData);

    if (!actionResult.success) {
      handleTurnstileTokenChange("");
      setTurnstileResetKey((key) => key + 1);
      setResult(actionResult);
      return;
    }

    storeResetOutcome({
      signedOutAt: actionResult.signedOutAt ?? new Date().toISOString(),
      signedOutDeviceCount: actionResult.signedOutDeviceCount ?? 0,
    });
    router.replace("/reset-password/done");
  };

  const tokenExpired = Boolean(result?.error && EXPIRED_ERROR_KEYS.has(result.error));
  const canSubmit =
    meetsPasswordPolicy(password) &&
    password === confirmPassword &&
    (!TURNSTILE_SITE_KEY || Boolean(turnstileToken));

  if (tokenExpired || !token) {
    return (
      <AuthScreenLayout auroraTone="danger-block">
        <AuthBlockingPanel
          primaryAction={
            <SecondaryButton href="/forgot-password">
              {t("auth.status.linkExpired.action")}
            </SecondaryButton>
          }
          secondaryAction={
            <AuthLink href="/login" tone="muted">
              {t("auth.common.backToLogin")}
            </AuthLink>
          }
          statusId="linkExpired"
        />
      </AuthScreenLayout>
    );
  }

  return (
    <AuthScreenLayout auroraTone={result && !result.success ? "danger-banner" : "default"}>
      <AuthEyebrow>{t("auth.forgotPassword.eyebrow")}</AuthEyebrow>
      <AuthTitle>{t("auth.resetPassword.title")}</AuthTitle>
      <AuthDescription>{t("auth.resetPassword.subtitle")}</AuthDescription>

      <form
        className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
        data-testid="reset-password-form"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <AuthLevelTwoBanner result={result} />

        <PasswordInput
          autoComplete="new-password"
          label={t("auth.field.newPassword")}
          {...register("password")}
        />

        <PasswordInput
          autoComplete="new-password"
          error={
            confirmPassword.length > 0 && confirmPassword !== password
              ? t("auth.status.passwordWeak.field")
              : undefined
          }
          label={t("auth.field.confirmNewPassword")}
          {...register("confirmPassword")}
        />

        <AuthPasswordStrength strength={strength} />

        <input type="hidden" {...register("token")} />
        <input type="hidden" {...register("turnstileToken")} />

        <PrimaryButton disabled={!canSubmit || isSubmitting} loading={isSubmitting} type="submit">
          {t("auth.resetPassword.cta")}
        </PrimaryButton>
      </form>

      {TURNSTILE_SITE_KEY ? (
        <div className="mt-[var(--auth-title-gap)]">
          <TurnstileWidget
            resetKey={turnstileResetKey}
            action="reset-password"
            compact
            verified={Boolean(turnstileToken)}
            onTokenChange={handleTurnstileTokenChange}
            siteKey={TURNSTILE_SITE_KEY}
          />
        </div>
      ) : null}

      <div className="mt-[var(--auth-title-gap)] flex justify-center">
        <AuthLink href="/login" size="small" tone="muted">
          {t("auth.common.backToLogin")}
        </AuthLink>
      </div>
    </AuthScreenLayout>
  );
}
