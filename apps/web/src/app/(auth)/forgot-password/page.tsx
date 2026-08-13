"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@wizards/types";
import { ArrowRight, Mail, MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { LoginCard } from "@/components/auth/login-card";
import { LoginPage } from "@/components/auth/login-page";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { forgotPasswordAction } from "@/lib/auth/actions";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function ForgotPasswordPage() {
  const { locale, t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "", turnstileToken: "" },
  });
  const turnstileToken = useWatch({ control, name: "turnstileToken" });
  const handleTurnstileTokenChange = useCallback(
    (token: string) => {
      setValue("turnstileToken", token, {
        shouldDirty: true,
        shouldValidate: Boolean(token),
      });
    },
    [setValue],
  );

  const onSubmit = async (values: ForgotPasswordInput) => {
    setServerError(null);
    setSubmittedEmail(null);

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("locale", locale);
    formData.set("turnstileToken", values.turnstileToken);

    const result = await forgotPasswordAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "auth.passwordReset.sendFailed");
      return;
    }

    setSubmittedEmail(result.email ?? values.email);
  };

  return (
    <LoginPage>
      <LoginCard label={t("auth.forgot.resetTitle")}>
        <div className="modern-login-card-header">
          <p>{t("auth.forgot.badge")}</p>
          <h1>{t("auth.forgot.resetTitle")}</h1>
          <span>{t("auth.forgot.description")}</span>
        </div>

        {submittedEmail ? (
          <>
            <div className="modern-login-status-card" role="status">
              <span aria-hidden="true">
                <MailCheck className="h-6 w-6" />
              </span>
              <div>
                <h1>{t("auth.forgot.checkEmail")}</h1>
                <p>{t("auth.forgot.instructions", { email: submittedEmail })}</p>
              </div>
            </div>

            <Link className="modern-login-secondary" href="/login">
              <ArrowRight className="h-5 w-5 rotate-180" />
              <span>{t("auth.forgot.backToLogin")}</span>
            </Link>
          </>
        ) : (
          <form className="modern-login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="modern-login-field">
              <label htmlFor="email">{t("auth.login.emailLabel")}</label>
              <div className="modern-login-input-wrap">
                <Mail className="modern-login-input-icon" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("auth.login.emailPlaceholder")}
                  {...register("email")}
                />
              </div>
              {errors.email ? (
                <p className="modern-login-field-error">{t(errors.email.message ?? "")}</p>
              ) : null}
            </div>

            <input type="hidden" {...register("turnstileToken")} />
            <div className="modern-login-turnstile">
              <TurnstileWidget
                action="forgot-password"
                onTokenChange={handleTurnstileTokenChange}
                siteKey={TURNSTILE_SITE_KEY}
              />
              {errors.turnstileToken ? (
                <p className="modern-login-field-error">
                  {t(errors.turnstileToken.message ?? "validation.turnstile.required")}
                </p>
              ) : null}
            </div>

            {serverError ? (
              <p className="modern-login-alert" role="alert">
                {t(serverError)}
              </p>
            ) : null}

            <button
              className="modern-login-primary"
              disabled={isSubmitting || !turnstileToken}
              type="submit"
            >
              <span>{isSubmitting ? t("auth.forgot.sending") : t("auth.forgot.submit")}</span>
              <Send className="h-5 w-5" />
            </button>
          </form>
        )}

        {!submittedEmail ? (
          <p className="modern-login-footer-link">
            <Link href="/login">
              {t("auth.forgot.backToLogin")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </p>
        ) : null}
      </LoginCard>
    </LoginPage>
  );
}
