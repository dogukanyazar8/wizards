"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@wizards/types";
import { ArrowRight, KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useI18n } from "@/components/providers/locale-provider";
import { loginAction } from "@/lib/auth/actions";

type OAuthProvider = "github" | "google";

export default function LoginPage() {
  const { t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
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

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);

    const result = await loginAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "auth.login.alertUnavailable");
    }
  };

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setServerError(null);
    setOauthLoading(provider);

    try {
      await signIn(provider, { callbackUrl: "/channels" });
    } catch {
      setServerError("auth.login.oauthError");
      setOauthLoading(null);
    }
  };

  const applyTestAccount = (email: string) => {
    setValue("email", email, { shouldDirty: true, shouldTouch: true });
    setValue("password", "password123", { shouldDirty: true, shouldTouch: true });
    setServerError(null);
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

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="group rounded-[26px] border border-[hsl(var(--border)/0.7)] bg-[linear-gradient(145deg,hsl(var(--surface-card)/0.78),hsl(var(--surface-soft)/0.4))] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)] hover:shadow-[0_20px_40px_hsl(var(--shadow-color)/0.12)]"
          onClick={() => applyTestAccount("demo@wizards.app")}
          type="button"
        >
          <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
            {t("auth.login.demoAccount")}
          </p>
          <p className="text-app-foreground mt-2 text-sm font-semibold">demo@wizards.app</p>
          <p className="text-app-muted mt-1 text-xs">{t("auth.login.demoDescription")}</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="app-badge-accent rounded-full px-2.5 py-1 text-[11px] font-semibold">
              {t("auth.login.fastStart")}
            </span>
            <span className="text-app-soft text-[11px]">{t("auth.login.sharedDemoWorkspace")}</span>
          </div>
        </button>
        <button
          className="group rounded-[26px] border border-[hsl(var(--border)/0.7)] bg-[linear-gradient(145deg,hsl(var(--surface-card)/0.78),hsl(var(--surface-soft)/0.4))] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)] hover:shadow-[0_20px_40px_hsl(var(--shadow-color)/0.12)]"
          onClick={() => applyTestAccount("test@wizards.app")}
          type="button"
        >
          <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
            {t("auth.login.testAccount")}
          </p>
          <p className="text-app-foreground mt-2 text-sm font-semibold">test@wizards.app</p>
          <p className="text-app-muted mt-1 text-xs">{t("auth.login.testDescription")}</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="app-badge-accent rounded-full px-2.5 py-1 text-[11px] font-semibold">
              {t("auth.login.multiUser")}
            </span>
            <span className="text-app-soft text-[11px]">{t("auth.login.idealForInvites")}</span>
          </div>
        </button>
      </div>

      <form className="space-y-5 rounded-[30px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.42)] p-5 shadow-[0_24px_60px_hsl(var(--shadow-color)/0.08)]" onSubmit={handleSubmit(onSubmit)} noValidate>
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
          <p className="app-inline-alert rounded-2xl border px-4 py-3 text-sm">
            {t(serverError)}
          </p>
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
        <div className="text-app-soft relative text-center text-xs uppercase tracking-[0.24em]">
          <span className="bg-transparent px-2">{t("auth.login.orContinueWith")}</span>
          <div className="absolute left-0 top-1/2 -z-10 h-px w-full bg-[hsl(var(--border)/0.72)]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("github")}
            className="text-app-foreground h-12 rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.3)] px-3 text-sm font-medium transition hover:border-[hsl(var(--border)/0.98)] hover:bg-[hsl(var(--surface-soft)/0.55)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {oauthLoading === "github" ? t("auth.login.oauthLoading") : t("auth.login.github")}
          </button>

          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("google")}
            className="text-app-foreground h-12 rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.3)] px-3 text-sm font-medium transition hover:border-[hsl(var(--border)/0.98)] hover:bg-[hsl(var(--surface-soft)/0.55)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {oauthLoading === "google" ? t("auth.login.oauthLoading") : t("auth.login.google")}
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
