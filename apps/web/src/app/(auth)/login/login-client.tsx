"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginFormInput, type LoginInput } from "@wizards/types";
import {
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { AppStartupScreen } from "@/components/app/app-startup-screen";
import { LoginCard } from "@/components/auth/login-card";
import { LoginPage } from "@/components/auth/login-page";
import { getLoginRoleHint, RoleTabs, type LoginRole } from "@/components/auth/role-tabs";
import { SocialLogin } from "@/components/auth/social-login";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { loginAction } from "@/lib/auth/actions";
import { buildDesktopOAuthStartUrl } from "@/lib/auth/desktop-oauth-start";
import { LOGIN_FAILED_MESSAGE_KEY } from "@/lib/auth/login-errors";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

type OAuthProvider = "google";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "auth.login.oauthAccessDenied",
  AccountNotLinked: "auth.login.oauthAccountNotLinked",
  CredentialsSignin: LOGIN_FAILED_MESSAGE_KEY,
  OAuthAccountNotLinked: "auth.login.oauthAccountNotLinked",
  OAuthCallbackError: "auth.login.oauthError",
  OAuthSignInError: "auth.login.oauthError",
  OAuthSignin: "auth.login.oauthError",
};

function getAuthErrorMessage(error: string | null | undefined) {
  if (!error) {
    return null;
  }

  return AUTH_ERROR_MESSAGES[error] ?? "auth.login.oauthError";
}

interface LoginClientProps {
  authError?: string | null;
  callbackUrl: string;
}

interface DesktopOAuthPendingDialogProps {
  onCancel: () => void;
  onRetry: () => void;
}

function DesktopOAuthPendingDialog({ onCancel, onRetry }: DesktopOAuthPendingDialogProps) {
  const { t } = useI18n();

  return (
    <div
      aria-labelledby="desktop-oauth-pending-title"
      aria-describedby="desktop-oauth-pending-description"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[hsl(var(--background)/0.62)] px-5 py-8 backdrop-blur-xl"
      role="dialog"
    >
      <section className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-[hsl(var(--border)/0.75)] bg-[linear-gradient(145deg,hsl(var(--background))_0%,hsl(var(--card))_58%,hsl(var(--primary)/0.08)_100%)] p-6 text-center shadow-[0_28px_90px_hsl(var(--shadow-color)/0.18)]">
        <button
          aria-label={t("common.close")}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-2xl text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted)/0.72)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.45)]"
          onClick={onCancel}
          type="button"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] shadow-[0_16px_44px_hsl(var(--primary)/0.18)]">
          <Loader2 className="h-6 w-6 motion-safe:animate-spin" aria-hidden="true" />
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[hsl(var(--primary))]">
          {t("auth.desktopOAuth.badge")}
        </p>
        <h2
          id="desktop-oauth-pending-title"
          className="mt-2 text-xl font-bold tracking-tight text-[hsl(var(--foreground))]"
        >
          {t("auth.desktopOAuth.pendingTitle")}
        </h2>
        <p
          id="desktop-oauth-pending-description"
          className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]"
        >
          {t("auth.desktopOAuth.pendingDescription")}
        </p>

        <div className="mt-5 rounded-2xl border border-[hsl(var(--primary)/0.16)] bg-[hsl(var(--primary)/0.07)] px-4 py-3 text-left">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                {t("auth.desktopOAuth.pendingBrowser")}
              </p>
              <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                {t("auth.desktopOAuth.pendingSecurity")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_16px_38px_hsl(var(--primary)/0.22)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.45)] motion-reduce:hover:translate-y-0"
            onClick={onRetry}
            type="button"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("auth.desktopOAuth.pendingRetry")}
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[hsl(var(--border)/0.75)] bg-[hsl(var(--background)/0.72)] px-4 py-2.5 text-sm font-bold text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--muted)/0.72)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.35)]"
            onClick={onCancel}
            type="button"
          >
            {t("auth.desktopOAuth.pendingCancel")}
          </button>
        </div>
      </section>
    </div>
  );
}

export function LoginClient({ authError = null, callbackUrl }: LoginClientProps) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(() =>
    getAuthErrorMessage(authError),
  );
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<LoginRole>("business");
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [showDesktopOAuthPending, setShowDesktopOAuthPending] = useState(false);
  const [showDesktopStartup, setShowDesktopStartup] = useState(false);
  const [showTwoFactorPrompt, setShowTwoFactorPrompt] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, undefined, LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      twoFactorCode: "",
      turnstileToken: "",
    },
  });
  const turnstileToken = useWatch({ control, name: "turnstileToken" });

  const handleTurnstileTokenChange = useCallback(
    (token: string) => {
      setValue("turnstileToken", token, {
        shouldDirty: true,
        shouldValidate: Boolean(token),
      });

      if (token) {
        setServerError((currentError) =>
          currentError?.startsWith("auth.turnstile") ||
          currentError?.startsWith("validation.turnstile")
            ? null
            : currentError,
        );
      }
    },
    [setValue],
  );

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    setSocialNotice(null);
    setShowDesktopStartup(isWhisprDesktopRuntime());

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("rememberMe", values.rememberMe ? "true" : "false");
    formData.set("twoFactorCode", values.twoFactorCode ?? "");
    formData.set("turnstileToken", values.turnstileToken);
    formData.set("callbackUrl", callbackUrl);

    const result = await loginAction(formData);

    if (!result.success) {
      setShowDesktopStartup(false);
      if (result.error === LOGIN_FAILED_MESSAGE_KEY) {
        setShowTwoFactorPrompt(true);
      }
      setServerError(result.error ?? "auth.login.alertUnavailable");
      return;
    }

    router.replace(callbackUrl);
  };

  const openDesktopOAuthBrowser = useCallback(() => {
    window.open(
      buildDesktopOAuthStartUrl(callbackUrl, window.location.origin),
      "_blank",
      "noopener,noreferrer",
    );
  }, [callbackUrl]);

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setServerError(null);
    setSocialNotice(null);
    setOauthLoading(provider);
    const isDesktopRuntime = isWhisprDesktopRuntime();

    if (isDesktopRuntime) {
      setShowDesktopStartup(false);
      setShowDesktopOAuthPending(true);
      openDesktopOAuthBrowser();
      setOauthLoading(null);
      return;
    }

    setShowDesktopStartup(false);

    try {
      await signIn(provider, { callbackUrl });
    } catch {
      setShowDesktopStartup(false);
      setShowDesktopOAuthPending(false);
      setServerError("auth.login.oauthError");
      setOauthLoading(null);
    }
  };

  const handleUnavailableProvider = (provider: string) => {
    setServerError(null);
    setSocialNotice(t("auth.login.socialUnavailable", { provider }));
  };

  return (
    <LoginPage>
      {showDesktopStartup ? (
        <AppStartupScreen experience="desktop" status="session" variant="overlay" />
      ) : null}
      {showDesktopOAuthPending ? (
        <DesktopOAuthPendingDialog
          onCancel={() => {
            setShowDesktopOAuthPending(false);
            setOauthLoading(null);
          }}
          onRetry={openDesktopOAuthBrowser}
        />
      ) : null}

      <LoginCard>
        <div className="modern-login-card-header">
          <p>{t("auth.login.modernEyebrow")}</p>
          <h1>{t("auth.login.modernTitle")}</h1>
          <span>{t("auth.login.modernSubtitle")}</span>
        </div>

        <RoleTabs value={selectedRole} onChange={setSelectedRole} />
        <p className="modern-role-hint">{getLoginRoleHint(selectedRole, locale)}</p>

        <form
          className="modern-login-form"
          data-testid="login-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
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

          <div className="modern-login-field">
            <div className="modern-login-label-row">
              <label htmlFor="password">{t("auth.login.passwordLabel")}</label>
              <Link href="/forgot-password">{t("auth.login.forgotPassword")}</Link>
            </div>
            <div className="modern-login-input-wrap">
              <LockKeyhole className="modern-login-input-icon" />
              <input
                id="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("auth.login.passwordPlaceholder")}
                {...register("password")}
              />
              <button
                aria-label={passwordVisible ? t("common.hide") : t("common.show")}
                className="modern-password-toggle"
                onClick={() => setPasswordVisible((current) => !current)}
                type="button"
              >
                {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password ? (
              <p className="modern-login-field-error">{t(errors.password.message ?? "")}</p>
            ) : null}
          </div>

          <input type="hidden" {...register("turnstileToken")} />

          {showTwoFactorPrompt ? (
            <div className="modern-login-field">
              <label htmlFor="twoFactorCode">{t("auth.login.twoFactorLabel")}</label>
              <div className="modern-login-input-wrap">
                <ShieldCheck className="modern-login-input-icon" />
                <input
                  id="twoFactorCode"
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="text"
                  placeholder={t("auth.login.twoFactorPlaceholder")}
                  {...register("twoFactorCode")}
                />
              </div>
              <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                {t("auth.login.twoFactorHelp")}
              </p>
              {errors.twoFactorCode ? (
                <p className="modern-login-field-error">
                  {t(errors.twoFactorCode.message ?? "validation.twoFactor.invalid")}
                </p>
              ) : null}
            </div>
          ) : (
            <button
              className="inline-flex min-h-9 items-center gap-2 self-start rounded-xl px-2.5 text-xs font-bold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.35)]"
              onClick={() => setShowTwoFactorPrompt(true)}
              type="button"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {t("auth.login.twoFactorUseCode")}
            </button>
          )}

          <label className="modern-login-checkbox">
            <input type="checkbox" {...register("rememberMe")} />
            <span>{t("auth.login.rememberMe")}</span>
          </label>

          <div className="modern-login-turnstile">
            <TurnstileWidget
              action="login"
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
            <div className="modern-login-alert" role="alert">
              <p>{t(serverError)}</p>
            </div>
          ) : null}

          <button
            className="modern-login-primary"
            disabled={isSubmitting || !turnstileToken}
            type="submit"
          >
            <span>{isSubmitting ? t("auth.login.loggingIn") : t("auth.login.continue")}</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>

        <Link className="modern-login-secondary" href="/register">
          <UserPlus className="h-5 w-5" />
          <span>{t("auth.login.createAccount")}</span>
        </Link>

        <div className="modern-login-divider">
          <span />
          <p>{t("auth.login.orContinueWith")}</p>
          <span />
        </div>

        <SocialLogin
          disabled={oauthLoading !== null || showDesktopOAuthPending}
          onGoogle={() => handleOAuthSignIn("google")}
          onUnavailable={handleUnavailableProvider}
        />

        {socialNotice ? (
          <div className="modern-login-alert is-info" role="status">
            <p>{socialNotice}</p>
          </div>
        ) : null}

        <p className="modern-login-footer-link">
          {t("auth.login.noAccount")}{" "}
          <Link href="/register">
            {t("auth.login.freeCreate")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </p>
      </LoginCard>
    </LoginPage>
  );
}
