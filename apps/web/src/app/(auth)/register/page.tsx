"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterSchema, type RegisterInput } from "@wizards/types";
import { ArrowRight, MailCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { registerAction, resendVerificationEmailAction } from "@/lib/auth/actions";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function RegisterPage() {
  const { locale, t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      turnstileToken: "",
    },
  });

  const turnstileToken = watch("turnstileToken");

  const handleTurnstileTokenChange = useCallback(
    (token: string) => {
      setValue("turnstileToken", token, {
        shouldDirty: true,
        shouldValidate: Boolean(token),
      });
    },
    [setValue],
  );

  const onSubmit = async (values: RegisterInput) => {
    setServerError(null);
    setVerificationEmail(null);
    setResendError(null);
    setResendMessage(null);

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("username", values.username);
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);
    formData.set("turnstileToken", values.turnstileToken);
    formData.set("locale", locale);

    const result = await registerAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "auth.register.alertUnavailable");
      return;
    }

    setVerificationEmail(result.email ?? values.email);
  };

  const handleResendVerification = async () => {
    if (!verificationEmail || isResendingVerification) {
      return;
    }

    setIsResendingVerification(true);
    setResendError(null);
    setResendMessage(null);

    const formData = new FormData();
    formData.set("email", verificationEmail);
    formData.set("locale", locale);

    const result = await resendVerificationEmailAction(formData);

    if (result.success) {
      setResendMessage(result.message ?? "auth.emailVerification.resendGenericSuccess");
    } else {
      setResendError(result.error ?? "auth.emailVerification.sendFailed");
    }

    setIsResendingVerification(false);
  };

  if (verificationEmail) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="app-badge-accent inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
            <MailCheck className="h-3.5 w-3.5" />
            {t("auth.register.checkEmailBadge")}
          </div>
          <div>
            <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">
              {t("auth.register.checkEmailTitle")}
            </h1>
            <p className="text-app-muted mt-3 text-sm leading-7">
              {t("auth.register.checkEmailDescription", { email: verificationEmail })}
            </p>
          </div>
        </div>

        <div
          className="rounded-[30px] border border-[hsl(var(--success)/0.28)] bg-[linear-gradient(135deg,hsl(var(--success)/0.12),hsl(var(--surface-card)/0.58))] p-5 shadow-[0_24px_60px_hsl(var(--shadow-color)/0.08)]"
          role="status"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]">
              <MailCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-app-foreground text-sm font-semibold">
                {t("auth.register.checkEmailMessage")}
              </p>
              <p className="text-app-muted mt-2 text-sm leading-7">
                {t("auth.register.checkEmailHint")}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.38)] p-4">
          <p className="text-app-muted text-sm leading-6">
            {t("auth.emailVerification.resendHelp")}
          </p>
          <button
            type="button"
            disabled={isResendingVerification}
            onClick={handleResendVerification}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.5)] px-4 text-sm font-semibold text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--surface-soft)/0.72)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isResendingVerification
              ? t("auth.emailVerification.resendingCta")
              : t("auth.emailVerification.resendCta")}
          </button>
          <div aria-live="polite">
            {resendMessage ? (
              <p className="text-xs font-medium text-[hsl(var(--success))]">
                {t(resendMessage)}
              </p>
            ) : null}
            {resendError ? (
              <p className="text-xs font-medium text-[hsl(var(--danger))]">
                {t(resendError)}
              </p>
            ) : null}
          </div>
        </div>

        <p className="text-app-muted text-center text-sm">
          {t("auth.register.verifiedPrompt")}{" "}
          <Link href="/login" className="text-app-accent font-semibold hover:opacity-80">
            {t("auth.register.signIn")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="app-badge-accent inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
          <Sparkles className="h-3.5 w-3.5" />
          {t("auth.register.badge")}
        </div>
        <div>
          <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">
            {t("auth.register.title")}
          </h1>
          <p className="text-app-muted mt-3 text-sm leading-7">
            {t("auth.register.description")}
          </p>
        </div>
      </div>

      <form
        className="space-y-5 rounded-[30px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.42)] p-5 shadow-[0_24px_60px_hsl(var(--shadow-color)/0.08)]"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="space-y-2">
          <label htmlFor="email" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            {t("common.email")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder="you@wizards.app"
            {...register("email")}
          />
          {errors.email ? <p className="text-app-danger text-xs">{t(errors.email.message ?? "")}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            {t("common.username")}
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder="wizard_user"
            {...register("username")}
          />
          <p className="text-app-soft text-xs">{t("auth.register.usernameHint")}</p>
          {errors.username ? <p className="text-app-danger text-xs">{t(errors.username.message ?? "")}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            {t("common.password")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder={t("auth.register.passwordPlaceholder")}
            {...register("password")}
          />
          {errors.password ? <p className="text-app-danger text-xs">{t(errors.password.message ?? "")}</p> : null}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="confirmPassword"
            className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]"
          >
            {t("common.confirmPassword")}
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder={t("auth.register.confirmPasswordPlaceholder")}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p className="text-app-danger text-xs">{t(errors.confirmPassword.message ?? "")}</p>
          ) : null}
        </div>

        <input type="hidden" {...register("turnstileToken")} />

        <div className="space-y-2">
          <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            {t("auth.turnstile.label")}
          </p>
          <TurnstileWidget
            onTokenChange={handleTurnstileTokenChange}
            siteKey={TURNSTILE_SITE_KEY}
          />
          {errors.turnstileToken ? (
            <p className="text-app-danger text-xs">{t(errors.turnstileToken.message ?? "")}</p>
          ) : null}
        </div>

        {serverError ? (
          <p
            className="app-inline-alert rounded-2xl border px-4 py-3 text-sm"
            role="alert"
          >
            {t(serverError)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || !TURNSTILE_SITE_KEY || !turnstileToken}
          className="app-button-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--primary-foreground)/0.28)] border-t-current" />
              {t("auth.register.creating")}
            </span>
          ) : (
            <>
              {t("common.continue")}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-app-muted text-center text-sm">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="text-app-accent font-semibold hover:opacity-80">
          {t("auth.register.signIn")}
        </Link>
      </p>
    </div>
  );
}
