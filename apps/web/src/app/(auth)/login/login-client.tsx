"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@wizards/types";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserPlus } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { LoginCard } from "@/components/auth/login-card";
import { LoginPage } from "@/components/auth/login-page";
import { getLoginRoleHint, RoleTabs, type LoginRole } from "@/components/auth/role-tabs";
import { SocialLogin } from "@/components/auth/social-login";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { loginAction } from "@/lib/auth/actions";
import { LOGIN_FAILED_MESSAGE_KEY } from "@/lib/auth/login-errors";

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

export function LoginClient({ authError = null, callbackUrl }: LoginClientProps) {
  const { locale, t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(() =>
    getAuthErrorMessage(authError),
  );
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [selectedRole, setSelectedRole] = useState<LoginRole>("business");
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  useEffect(() => {
    setServerError(getAuthErrorMessage(authError));
  }, [authError]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
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

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("turnstileToken", values.turnstileToken);
    formData.set("callbackUrl", callbackUrl);

    const result = await loginAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "auth.login.alertUnavailable");
    }
  };

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setServerError(null);
    setSocialNotice(null);
    setOauthLoading(provider);

    try {
      await signIn(provider, { callbackUrl });
    } catch {
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

          <label className="modern-login-checkbox">
            <input type="checkbox" />
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
          disabled={oauthLoading !== null}
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
