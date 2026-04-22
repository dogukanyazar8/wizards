"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@wizards/types";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

export default function ForgotPasswordPage() {
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
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-xl font-extrabold text-emerald-300">
          ✓
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-100">Check your email</h1>
          <p className="text-sm text-slate-400">
            If an account exists for {submittedEmail}, you&apos;ll receive reset instructions.
          </p>
        </div>
        <Link href="/login" className="inline-block text-sm font-semibold text-emerald-300 hover:text-emerald-200">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-100">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-400">Enter your email and we&apos;ll send a reset link.</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
            placeholder="you@wizards.app"
            {...register("email")}
          />
          {errors.email ? <p className="text-xs text-rose-400">{errors.email.message}</p> : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Sending...
            </span>
          ) : (
            "Send Reset Link"
          )}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400">
        <Link href="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">
          Back to login
        </Link>
      </p>
    </div>
  );
}
