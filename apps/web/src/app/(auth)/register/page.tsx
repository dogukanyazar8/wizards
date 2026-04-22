"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterSchema, type RegisterInput } from "@wizards/types";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { registerAction } from "@/lib/auth/actions";

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);

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
    },
  });

  const onSubmit = async (values: RegisterInput) => {
    setServerError(null);

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("username", values.username);
    formData.set("password", values.password);
    formData.set("confirmPassword", values.confirmPassword);

    const result = await registerAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "Unable to create account");
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-xl font-extrabold text-sky-300">
          W
        </div>
        <h1 className="text-2xl font-semibold text-slate-100">Create an account</h1>
        <p className="mt-1 text-sm text-slate-400">Start building your Wizards community.</p>
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
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
            placeholder="you@wizards.app"
            {...register("email")}
          />
          {errors.email ? <p className="text-xs text-rose-400">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
            placeholder="wizard_user"
            {...register("username")}
          />
          <p className="text-xs text-slate-500">Only letters, numbers, underscores</p>
          {errors.username ? <p className="text-xs text-rose-400">{errors.username.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
            placeholder="Create a strong password"
            {...register("password")}
          />
          {errors.password ? <p className="text-xs text-rose-400">{errors.password.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirmPassword"
            className="text-xs font-semibold uppercase tracking-wide text-slate-400"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500"
            placeholder="Repeat your password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p className="text-xs text-rose-400">{errors.confirmPassword.message}</p>
          ) : null}
        </div>

        {serverError ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creating account...
            </span>
          ) : (
            "Continue"
          )}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-sky-300 hover:text-sky-200">
          Login
        </Link>
      </p>
    </div>
  );
}
