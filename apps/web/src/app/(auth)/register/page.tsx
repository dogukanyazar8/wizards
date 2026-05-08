"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterSchema, type RegisterInput } from "@wizards/types";
import { Eye, EyeOff, KeyRound, Mail, MailCheck, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { PrimaryButton, SocialAuthButtons, TextInput } from "@/components/auth/auth-screen";
import { useI18n } from "@/components/providers/locale-provider";
import { registerAction, resendVerificationEmailAction } from "@/lib/auth/actions";

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

export default function RegisterPage() {
  const { locale, t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      turnstileToken: "auth-ui-placeholder",
    },
  });

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
      <div className="auth-reference-form-stack">
        <div className="auth-reference-status-card" role="status">
          <div>
            <MailCheck className="h-6 w-6" />
          </div>
          <div>
            <h1>{t("auth.register.checkEmailTitle")}</h1>
            <p>{t("auth.register.checkEmailDescription", { email: verificationEmail })}</p>
          </div>
        </div>

        <div className="auth-reference-status-card is-compact">
          <p>{t("auth.emailVerification.resendHelp")}</p>
          <button
            className="auth-reference-mini-button"
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

        <p className="auth-reference-bottom-text">
          {t("auth.register.verifiedPrompt")} <Link href="/login">{t("auth.register.signIn")}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-reference-form-stack auth-reference-register-stack">
      <form
        className="auth-reference-form"
        data-testid="register-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <TextInput
          id="username"
          type="text"
          autoComplete="name"
          error={errors.username ? t(errors.username.message ?? "") : null}
          icon={UserRound}
          label={t("auth.register.fullNameLabel")}
          placeholder={t("auth.register.fullNamePlaceholder")}
          {...register("username", { setValueAs: normalizeNameAsUsername })}
        />

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

        <div className="auth-reference-password-grid">
          <TextInput
            id="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="new-password"
            error={errors.password ? t(errors.password.message ?? "") : null}
            icon={KeyRound}
            label={t("auth.register.passwordLabel")}
            placeholder={t("auth.register.passwordPlaceholder")}
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

          <TextInput
            id="confirmPassword"
            type={confirmPasswordVisible ? "text" : "password"}
            autoComplete="new-password"
            error={errors.confirmPassword ? t(errors.confirmPassword.message ?? "") : null}
            icon={KeyRound}
            label={t("auth.register.confirmPasswordLabel")}
            placeholder={t("auth.register.confirmPasswordPlaceholder")}
            rightElement={
              <button
                aria-label={confirmPasswordVisible ? t("common.hide") : t("common.show")}
                onClick={() => setConfirmPasswordVisible((current) => !current)}
                type="button"
              >
                {confirmPasswordVisible ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            }
            {...register("confirmPassword")}
          />
        </div>

        <input type="hidden" {...register("turnstileToken")} />

        <p className="auth-reference-password-help">
          <ShieldCheck className="h-4 w-4" />
          <span>{t("auth.register.passwordHelp")}</span>
        </p>

        <label className="auth-reference-checkbox auth-reference-terms">
          <input
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            type="checkbox"
          />
          <span>
            <Link href="/terms">{t("auth.register.termsLink")}</Link>
            {"'"}nı ve <Link href="/privacy">{t("auth.register.privacyLink")}</Link>
            {"'"}nı okudum, kabul ediyorum.
          </span>
        </label>

        {serverError ? (
          <p className="auth-reference-alert" role="alert">
            {t(serverError)}
          </p>
        ) : null}

        <PrimaryButton disabled={isSubmitting} type="submit">
          {isSubmitting ? t("auth.register.creating") : t("auth.login.createAccount")}
        </PrimaryButton>
      </form>

      <p className="auth-reference-bottom-text auth-reference-have-account">
        {t("auth.register.haveAccount")} <Link href="/login">{t("auth.register.signIn")}</Link>
      </p>

      <div className="auth-reference-divider">
        <span />
        <p>{t("auth.register.orSignUpWith")}</p>
        <span />
      </div>

      <SocialAuthButtons />
    </div>
  );
}
