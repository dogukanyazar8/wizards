"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@wizards/types";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  PrimaryButton,
  SecondaryButton,
  SocialAuthButtons,
  TextInput,
} from "@/components/auth/auth-screen";
import { useI18n } from "@/components/providers/locale-provider";
import { loginAction, resendVerificationEmailAction } from "@/lib/auth/actions";

type OAuthProvider = "google";

interface LoginClientProps {
  callbackUrl: string;
}

export function LoginClient({ callbackUrl }: LoginClientProps) {
  const { locale, t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
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

  return (
    <div className="auth-reference-form-stack">
      <form
        className="auth-reference-form"
        data-testid="login-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <TextInput
          id="email"
          type="email"
          autoComplete="email"
          error={errors.email ? t(errors.email.message ?? "") : null}
          icon={Mail}
          label={t("auth.login.emailLabel")}
          placeholder={t("auth.login.emailPlaceholder")}
          {...register("email")}
        />

        <TextInput
          id="password"
          type={passwordVisible ? "text" : "password"}
          autoComplete="current-password"
          error={errors.password ? t(errors.password.message ?? "") : null}
          icon={KeyRound}
          label={t("auth.login.passwordLabel")}
          labelAction={
            <Link className="auth-reference-label-link" href="/forgot-password">
              {t("auth.login.forgotPassword")}
            </Link>
          }
          placeholder={t("auth.login.passwordPlaceholder")}
          rightElement={
            <button
              aria-label={passwordVisible ? t("common.hide") : t("common.show")}
              onClick={() => setPasswordVisible((current) => !current)}
              type="button"
            >
              {passwordVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          }
          {...register("password")}
        />

        <label className="auth-reference-checkbox">
          <input type="checkbox" />
          <span>{t("auth.login.rememberMe")}</span>
        </label>

        {serverError ? (
          <div className="auth-reference-alert" role="alert">
            <p>{t(serverError)}</p>
            {unverifiedEmail ? (
              <div className="mt-3 space-y-3">
                <p>{t("auth.login.emailNotVerifiedHelp")}</p>
                <button
                  className="auth-reference-mini-button"
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

        <PrimaryButton disabled={isSubmitting} type="submit">
          {isSubmitting ? t("auth.login.loggingIn") : t("auth.login.continue")}
        </PrimaryButton>
      </form>

      <SecondaryButton href="/register">{t("auth.login.createAccount")}</SecondaryButton>

      <div className="auth-reference-divider">
        <span />
        <p>{t("auth.login.orContinueWith")}</p>
        <span />
      </div>

      <SocialAuthButtons
        disabled={oauthLoading !== null}
        onGoogle={() => handleOAuthSignIn("google")}
      />

      <p className="auth-reference-bottom-text">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register">{t("auth.login.createAccountInline")}</Link>
      </p>
    </div>
  );
}
