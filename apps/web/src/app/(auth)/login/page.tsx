"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@wizards/types";
import { ArrowRight, KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useI18n } from "@/components/providers/locale-provider";
import { loginAction, resendVerificationEmailAction } from "@/lib/auth/actions";

type OAuthProvider = "github" | "google";

function GitHubIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.58 2.36 1.12 2.93.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 7c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.95.68 1.91 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.12 10.12 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.76-.07-1.49-.19-2.19H12v4.14h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.48Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.51c-.9.6-2.05.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H3.06v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.88a6 6 0 0 1 0-3.76v-2.6H3.06a10 10 0 0 0 0 8.96l3.34-2.6Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.86-2.87C16.96 3.01 14.7 2 12 2a10 10 0 0 0-8.94 5.52l3.34 2.6C7.19 7.75 9.4 5.99 12 5.99Z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { locale, t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    setUnverifiedEmail(null);
    setResendError(null);
    setResendMessage(null);

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);

    const result = await loginAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "auth.login.alertUnavailable");
      setUnverifiedEmail(
        result.error === "auth.login.emailNotVerified" ? result.email ?? values.email : null,
      );
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail || isResendingVerification) {
      return;
    }

    setIsResendingVerification(true);
    setResendError(null);
    setResendMessage(null);

    const formData = new FormData();
    formData.set("email", unverifiedEmail);
    formData.set("locale", locale);

    const result = await resendVerificationEmailAction(formData);

    if (result.success) {
      setResendMessage(result.message ?? "auth.emailVerification.resendGenericSuccess");
    } else {
      setResendError(result.error ?? "auth.emailVerification.sendFailed");
    }

    setIsResendingVerification(false);
  };

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setServerError(null);
    setUnverifiedEmail(null);
    setResendError(null);
    setResendMessage(null);
    setOauthLoading(provider);

    try {
      await signIn(provider, { callbackUrl: "/channels" });
    } catch {
      setServerError("auth.login.oauthError");
      setOauthLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="app-badge-accent inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
          <Sparkles className="h-3.5 w-3.5" />
          {t("auth.login.badge")}
        </div>
        <div>
          <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">
            {t("auth.login.title")}
          </h1>
          <p className="text-app-muted mt-3 text-sm leading-7">
            {t("auth.login.description")}
          </p>
        </div>
      </div>

      <form className="auth-form-card space-y-5 rounded-[30px] border p-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-2">
          <label htmlFor="email" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            {t("common.email")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder="you@whispr.team"
            {...register("email")}
          />
          {errors.email ? <p className="text-app-danger text-xs">{t(errors.email.message ?? "")}</p> : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
              {t("common.password")}
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80">
              {t("auth.login.forgotPassword")}
            </Link>
          </div>
          <div className="relative">
            <KeyRound className="text-app-soft pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="app-input h-12 w-full rounded-2xl border pl-11 pr-4 text-sm transition"
              placeholder={t("auth.login.passwordPlaceholder")}
              {...register("password")}
            />
          </div>
          {errors.password ? <p className="text-app-danger text-xs">{t(errors.password.message ?? "")}</p> : null}
        </div>

        {serverError ? (
          <div className="app-inline-alert rounded-2xl border px-4 py-3 text-sm" role="alert">
            <p>{t(serverError)}</p>
            {unverifiedEmail ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-5 opacity-80">
                  {t("auth.login.emailNotVerifiedHelp")}
                </p>
                <button
                  type="button"
                  disabled={isResendingVerification}
                  onClick={handleResendVerification}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.64)] px-3 text-xs font-semibold text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--surface-soft)/0.72)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isResendingVerification
                    ? t("auth.login.resendingVerification")
                    : t("auth.login.resendVerification")}
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
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="app-button-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--primary-foreground)/0.28)] border-t-current" />
              {t("auth.login.loggingIn")}
            </span>
          ) : (
            <>
              {t("auth.login.continue")}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="space-y-3">
        <div className="text-app-soft flex items-center gap-3 text-center text-xs uppercase tracking-[0.24em]">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[hsl(var(--border)/0.72)]" />
          <span className="shrink-0">{t("auth.login.orContinueWith")}</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[hsl(var(--border)/0.72)]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("github")}
            className="auth-oauth-button inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            <GitHubIcon />
            <span>
              {oauthLoading === "github" ? t("auth.login.oauthLoading") : t("auth.login.github")}
            </span>
          </button>

          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("google")}
            className="auth-oauth-button inline-flex h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            <GoogleIcon />
            <span>
              {oauthLoading === "google" ? t("auth.login.oauthLoading") : t("auth.login.google")}
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.55),hsl(var(--surface-soft)/0.32))] p-4">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
          {t("auth.login.needAccountLabel")}
        </p>
        <p className="text-app-muted mt-2 text-sm leading-7">
          {t("auth.login.needAccountDescription")}
        </p>
        <Link
          href="/register"
          className="text-app-accent mt-4 inline-flex items-center gap-2 text-sm font-semibold hover:opacity-80"
        >
          {t("auth.login.createAccount")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
