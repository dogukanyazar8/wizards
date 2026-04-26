"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@wizards/types";
import { MailCheck, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useI18n } from "@/components/providers/locale-provider";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setSubmittedEmail(values.email);
  };

  if (submittedEmail) {
    return (
      <div className="space-y-6 text-center">
        <div className="app-badge-success mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border">
          <MailCheck className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-app-foreground text-2xl font-semibold">
            {t("auth.forgot.checkEmail")}
          </h1>
          <p className="text-app-muted text-sm leading-7">
            {t("auth.forgot.instructions", { email: submittedEmail })}
          </p>
        </div>
        <Link
          href="/login"
          className="text-app-accent inline-block text-sm font-semibold hover:opacity-80"
        >
          {t("auth.forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="app-badge-accent inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
          <Send className="h-3.5 w-3.5" />
          {t("auth.forgot.badge")}
        </div>
        <div>
          <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">
            {t("auth.forgot.resetTitle")}
          </h1>
          <p className="text-app-muted mt-3 text-sm leading-7">
            {t("auth.forgot.description")}
          </p>
        </div>
      </div>

      <form
        className="space-y-5 rounded-[30px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.42)] p-5 shadow-[0_24px_60px_hsl(var(--shadow-color)/0.08)]"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]"
          >
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
          {errors.email ? (
            <p className="text-app-danger text-xs">{t(errors.email.message ?? "")}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="app-button-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--primary-foreground)/0.28)] border-t-current" />
              {t("auth.forgot.sending")}
            </span>
          ) : (
            t("auth.forgot.submit")
          )}
        </button>
      </form>

      <p className="text-app-muted text-center text-sm">
        <Link
          href="/login"
          className="text-app-accent font-semibold hover:opacity-80"
        >
          {t("auth.forgot.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
