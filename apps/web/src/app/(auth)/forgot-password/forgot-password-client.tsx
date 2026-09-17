"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@wizards/types";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  AuthDescription,
  AuthEyebrow,
  AuthLink,
  AuthScreenLayout,
  AuthTitle,
  PrimaryButton,
  TextInput,
} from "@/components/auth/auth-screen";
import { AuthLevelTwoBanner } from "@/components/auth/auth-status-view";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { forgotPasswordAction, type AuthActionResult } from "@/lib/auth/actions";
import { storePendingResetRequest } from "@/lib/auth/pending-reset";

/**
 * SPEC-GIRIS-KAYIT §4.7 — `Şifreni sıfırla`.
 *
 * Yanıt her zaman jeneriktir: adres kayıtlı olsun ya da olmasın ekran aynı sonucu gösterir, yoksa
 * form bir hesap numaralandırma aracına dönerdi.
 */

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function ForgotPasswordClient() {
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
  } = useForm<ForgotPasswordInput>({
    defaultValues: { email: "", turnstileToken: "" },
    resolver: zodResolver(ForgotPasswordSchema),
  });
  const turnstileToken = useWatch({ control, name: "turnstileToken" }) ?? "";

  const handleTurnstileTokenChange = useCallback(
    (token: string) => {
      setValue("turnstileToken", token, { shouldDirty: true, shouldValidate: Boolean(token) });
    },
    [setValue],
  );

  const onSubmit = async (values: ForgotPasswordInput) => {
    setResult(null);

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("turnstileToken", values.turnstileToken);

    const actionResult = await forgotPasswordAction(formData);

    if (!actionResult.success) {
      handleTurnstileTokenChange("");
      setTurnstileResetKey((key) => key + 1);
      setResult(actionResult);
      return;
    }

    // Adres URL'e yazılmaz; `Bağlantı gönderildi` ekranı sekmeden okur.
    storePendingResetRequest({
      email: actionResult.email ?? values.email,
      retryAfterMs: actionResult.retryAfterMs ?? 0,
    });
    router.replace("/forgot-password/sent");
  };

  return (
    <AuthScreenLayout auroraTone={result && !result.success ? "danger-banner" : "default"}>
      <AuthEyebrow>{t("auth.forgotPassword.eyebrow")}</AuthEyebrow>
      <AuthTitle>{t("auth.forgotPassword.title")}</AuthTitle>
      <AuthDescription>{t("auth.forgotPassword.subtitle")}</AuthDescription>

      <form
        className="mt-[var(--auth-title-gap)] flex flex-col gap-[var(--auth-title-gap)]"
        data-testid="forgot-password-form"
        noValidate
        onSubmit={handleSubmit(onSubmit)}
      >
        <AuthLevelTwoBanner result={result} />

        <TextInput
          autoComplete="email"
          label={t("auth.field.email")}
          placeholder={t("auth.field.emailPlaceholder")}
          type="email"
          {...register("email")}
        />

        <input type="hidden" {...register("turnstileToken")} />

        <PrimaryButton
          disabled={isSubmitting || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
          loading={isSubmitting}
          type="submit"
        >
          {t("auth.forgotPassword.cta")}
        </PrimaryButton>
      </form>

      {TURNSTILE_SITE_KEY ? (
        <div className="mt-[var(--auth-title-gap)]">
          <TurnstileWidget
            resetKey={turnstileResetKey}
            action="forgot-password"
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
