"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@wizards/types";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserPlus } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { LoginCard } from "@/components/auth/login-card";
import { LoginPage } from "@/components/auth/login-page";
import { getLoginRoleHint, RoleTabs, type LoginRole } from "@/components/auth/role-tabs";
import { SocialLogin } from "@/components/auth/social-login";
import { useI18n } from "@/components/providers/locale-provider";
import { loginAction, resendVerificationEmailAction } from "@/lib/auth/actions";

type OAuthProvider = "google";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "auth.login.oauthAccessDenied",
  AccountNotLinked: "auth.login.oauthAccountNotLinked",
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
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [selectedRole, setSelectedRole] = useState<LoginRole>("business");
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  useEffect(() => {
    setServerError(getAuthErrorMessage(authError));
    setUnverifiedEmail(null);
    setResendError(null);
    setResendMessage(null);
  }, [authError]);

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
    setSocialNotice(null);
    setUnverifiedEmail(null);
    setResendError(null);
    setResendMessage(null);

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    formData.set("callbackUrl", callbackUrl);

    const result = await loginAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "auth.login.alertUnavailable");
      setUnverifiedEmail(
        result.error === "auth.login.emailNotVerified" ? (result.email ?? values.email) : null,
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
    setSocialNotice(null);
    setUnverifiedEmail(null);
    setResendError(null);
    setResendMessage(null);
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

          <label className="modern-login-checkbox">
            <input type="checkbox" />
            <span>{t("auth.login.rememberMe")}</span>
          </label>

          {serverError ? (
            <div className="modern-login-alert" role="alert">
              <p>{t(serverError)}</p>
              {unverifiedEmail ? (
                <div className="mt-3 space-y-3">
                  <p>{t("auth.login.emailNotVerifiedHelp")}</p>
                  <button
                    className="modern-login-mini-button"
                    disabled={isResendingVerification}
                    onClick={handleResendVerification}
                    type="button"
                  >
                    {isResendingVerification
                      ? t("auth.login.resendingVerification")
                      : t("auth.login.resendVerification")}
                  </button>
                  <div aria-live="polite">
                    {resendMessage ? (
                      <p className="text-[hsl(var(--success))]">{t(resendMessage)}</p>
                    ) : null}
                    {resendError ? (
                      <p className="text-[hsl(var(--danger))]">{t(resendError)}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <button className="modern-login-primary" disabled={isSubmitting} type="submit">
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
