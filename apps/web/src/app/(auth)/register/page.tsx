"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterSchema, type RegisterInput } from "@wizards/types";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MailCheck,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { LoginCard } from "@/components/auth/login-card";
import { LoginPage } from "@/components/auth/login-page";
import { RoleTabs, type LoginRole } from "@/components/auth/role-tabs";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useI18n } from "@/components/providers/locale-provider";
import { registerAction, resendVerificationEmailAction } from "@/lib/auth/actions";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const REGISTER_COPY = {
  en: {
    eyebrow: "Secure start",
    label: "Whispr registration form",
    subtitle: "Choose your profile, create your account, and continue where you left off.",
    termsAccept: "I have read and accept the",
    termsAnd: "and",
    title: "Join Whispr",
    verifyLabel: "Whispr email verification",
  },
  tr: {
    eyebrow: "Güvenli başlangıç",
    label: "Whispr kayıt formu",
    subtitle: "Profilinizi seçin, hesabınızı oluşturun ve kaldığınız yerden başlayın.",
    termsAccept: "okudum, kabul ediyorum.",
    termsAnd: "ve",
    title: "Whispr'e katılın",
    verifyLabel: "Whispr e-posta doğrulama",
  },
} as const;

function normalizeNameAsUsername(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

const subscribeToLocation = () => () => {};

function getSignInHref() {
  if (typeof window === "undefined") {
    return "/login";
  }

  const safeCallbackUrl = getSafeAuthRedirectPath(
    new URLSearchParams(window.location.search).get("callbackUrl"),
  );
  return safeCallbackUrl === "/channels"
    ? "/login"
    : `/login?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`;
}

export default function RegisterPage() {
  const { locale, t } = useI18n();
  const copy = REGISTER_COPY[locale];
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [selectedRole, setSelectedRole] = useState<LoginRole>("business");
  const signInHref = useSyncExternalStore(subscribeToLocation, getSignInHref, () => "/login");

  const {
    register,
    handleSubmit,
    setValue,
    control,
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
      <LoginPage>
        <LoginCard className="is-register-card" label={copy.verifyLabel}>
          <div className="modern-login-status-card" role="status">
            <span aria-hidden="true">
              <MailCheck className="h-6 w-6" />
            </span>
            <div>
              <h1>{t("auth.register.checkEmailTitle")}</h1>
              <p>{t("auth.register.checkEmailDescription", { email: verificationEmail })}</p>
            </div>
          </div>

          <div className="modern-login-status-card is-compact">
            <p>{t("auth.emailVerification.resendHelp")}</p>
            <button
              className="modern-login-mini-button"
              disabled={isResendingVerification}
              onClick={handleResendVerification}
              type="button"
            >
              {isResendingVerification
                ? t("auth.emailVerification.resendingCta")
                : t("auth.emailVerification.resendCta")}
            </button>
            <div aria-live="polite">
              {resendMessage ? (
                <p className="text-[hsl(var(--success))]">{t(resendMessage)}</p>
              ) : null}
              {resendError ? <p className="text-[hsl(var(--danger))]">{t(resendError)}</p> : null}
            </div>
          </div>

          <p className="modern-login-footer-link">
            {t("auth.register.verifiedPrompt")}{" "}
            <Link href={signInHref}>{t("auth.register.signIn")}</Link>
          </p>
        </LoginCard>
      </LoginPage>
    );
  }

  return (
    <LoginPage>
      <LoginCard className="is-register-card" label={copy.label}>
        <div className="modern-login-card-header">
          <p>{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <span>{copy.subtitle}</span>
        </div>

        <RoleTabs value={selectedRole} onChange={setSelectedRole} />

        <form
          className="modern-login-form modern-register-form"
          data-testid="register-form"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div className="modern-register-grid">
            <div className="modern-login-field">
              <label htmlFor="username">{t("auth.register.fullNameLabel")}</label>
              <div className="modern-login-input-wrap">
                <UserRound className="modern-login-input-icon" />
                <input
                  id="username"
                  type="text"
                  autoComplete="name"
                  placeholder={t("auth.register.fullNamePlaceholder")}
                  {...register("username", { setValueAs: normalizeNameAsUsername })}
                />
              </div>
              {errors.username ? (
                <p className="modern-login-field-error">{t(errors.username.message ?? "")}</p>
              ) : null}
            </div>

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
          </div>

          <div className="modern-register-grid">
            <div className="modern-login-field">
              <label htmlFor="password">{t("auth.register.passwordLabel")}</label>
              <div className="modern-login-input-wrap">
                <KeyRound className="modern-login-input-icon" />
                <input
                  id="password"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t("auth.register.passwordPlaceholder")}
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

            <div className="modern-login-field">
              <label htmlFor="confirmPassword">{t("auth.register.confirmPasswordLabel")}</label>
              <div className="modern-login-input-wrap">
                <KeyRound className="modern-login-input-icon" />
                <input
                  id="confirmPassword"
                  type={confirmPasswordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={t("auth.register.confirmPasswordPlaceholder")}
                  {...register("confirmPassword")}
                />
                <button
                  aria-label={confirmPasswordVisible ? t("common.hide") : t("common.show")}
                  className="modern-password-toggle"
                  onClick={() => setConfirmPasswordVisible((current) => !current)}
                  type="button"
                >
                  {confirmPasswordVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword ? (
                <p className="modern-login-field-error">
                  {t(errors.confirmPassword.message ?? "")}
                </p>
              ) : null}
            </div>
          </div>

          <input type="hidden" {...register("turnstileToken")} />

          <p className="modern-register-helper">
            <ShieldCheck className="h-4 w-4" />
            <span>{t("auth.register.passwordHelp")}</span>
          </p>

          <div className="modern-login-turnstile">
            <TurnstileWidget
              onTokenChange={handleTurnstileTokenChange}
              siteKey={TURNSTILE_SITE_KEY}
            />
            {errors.turnstileToken ? (
              <p className="modern-login-field-error">
                {t(errors.turnstileToken.message ?? "validation.turnstile.required")}
              </p>
            ) : null}
          </div>

          <label className="modern-login-checkbox modern-register-terms">
            <input
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              type="checkbox"
            />
            <span>
              {locale === "en" ? (
                <>
                  {copy.termsAccept} <Link href="/terms">{t("auth.register.termsLink")}</Link>{" "}
                  {copy.termsAnd} <Link href="/privacy">{t("auth.register.privacyLink")}</Link>.
                </>
              ) : (
                <>
                  <Link href="/terms">{t("auth.register.termsLink")}</Link>
                  &apos;nı {copy.termsAnd}{" "}
                  <Link href="/privacy">{t("auth.register.privacyLink")}</Link>
                  &apos;nı {copy.termsAccept}
                </>
              )}
            </span>
          </label>

          {serverError ? (
            <p className="modern-login-alert" role="alert">
              {t(serverError)}
            </p>
          ) : null}

          <button
            className="modern-login-primary"
            disabled={isSubmitting || !termsAccepted || !turnstileToken}
            type="submit"
          >
            <span>
              {isSubmitting ? t("auth.register.creating") : t("auth.login.createAccount")}
            </span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>

        <p className="modern-login-footer-link">
          {t("auth.register.haveAccount")}{" "}
          <Link href={signInHref}>{t("auth.register.signIn")}</Link>
        </p>
      </LoginCard>
    </LoginPage>
  );
}
