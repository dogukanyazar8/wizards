"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ResetPasswordSchema, type ResetPasswordInput } from "@wizards/types";
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { LoginCard } from "@/components/auth/login-card";
import { LoginPage } from "@/components/auth/login-page";
import { useI18n } from "@/components/providers/locale-provider";
import { resetPasswordAction } from "@/lib/auth/actions";

type ResetPasswordClientProps = {
  email?: string | undefined;
  status: "expired" | "invalid" | "valid";
  token: string;
};

export function ResetPasswordClient({ email, status, token }: ResetPasswordClientProps) {
  const { t } = useI18n();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: {
      confirmPassword: "",
      password: "",
      token,
    },
  });

  const onSubmit = async (values: ResetPasswordInput) => {
    setServerError(null);

    const formData = new FormData();
    formData.set("confirmPassword", values.confirmPassword);
    formData.set("password", values.password);
    formData.set("token", values.token);

    const result = await resetPasswordAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "auth.passwordReset.unavailable");
      return;
    }

    setIsComplete(true);
  };

  const isTokenUsable = status === "valid";

  return (
    <LoginPage>
      <LoginCard label={t("auth.passwordReset.title")}>
        <div className="modern-login-card-header">
          <p>{t("auth.passwordReset.badge")}</p>
          <h1>{t("auth.passwordReset.title")}</h1>
          <span>
            {isTokenUsable
              ? t("auth.passwordReset.description")
              : t(
                  status === "expired"
                    ? "auth.passwordReset.expiredToken"
                    : "auth.passwordReset.invalidToken",
                )}
          </span>
        </div>

        {isComplete ? (
          <>
            <div className="modern-login-status-card" role="status">
              <span aria-hidden="true">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div>
                <h1>{t("auth.passwordReset.successTitle")}</h1>
                <p>{t("auth.passwordReset.successBody")}</p>
              </div>
            </div>
            <Link className="modern-login-primary modern-reset-login-cta" href="/login">
              <span>{t("auth.passwordReset.loginCta")}</span>
              <ArrowRight className="h-5 w-5" />
            </Link>
          </>
        ) : isTokenUsable ? (
          <form
            className="modern-login-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            {email ? (
              <div className="modern-login-status-card is-compact">
                <p>{t("auth.passwordReset.accountHint", { email })}</p>
              </div>
            ) : null}

            <input type="hidden" {...register("token")} />

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

            {serverError ? (
              <p className="modern-login-alert" role="alert">
                {t(serverError)}
              </p>
            ) : null}

            <button className="modern-login-primary" disabled={isSubmitting} type="submit">
              <span>
                {isSubmitting ? t("auth.passwordReset.saving") : t("auth.passwordReset.submit")}
              </span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>
        ) : (
          <>
            <div className="modern-login-alert is-inline" role="alert">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              <p>
                {t(
                  status === "expired"
                    ? "auth.passwordReset.expiredTokenHelp"
                    : "auth.passwordReset.invalidTokenHelp",
                )}
              </p>
            </div>
            <Link className="modern-login-secondary" href="/forgot-password">
              <ArrowRight className="h-5 w-5 rotate-180" />
              <span>{t("auth.passwordReset.requestNewLink")}</span>
            </Link>
          </>
        )}
      </LoginCard>
    </LoginPage>
  );
}
