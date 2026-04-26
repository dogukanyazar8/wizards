"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterSchema, type RegisterInput } from "@wizards/types";
import { ArrowRight, Sparkles } from "lucide-react";
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
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="app-badge-accent inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
          <Sparkles className="h-3.5 w-3.5" />
          Join Wizards
        </div>
        <div>
          <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">
            Create an account
          </h1>
          <p className="text-app-muted mt-3 text-sm leading-7">
            Start building your Wizards community with your own profile and workspace.
          </p>
        </div>
      </div>

      <form
        className="space-y-5 rounded-[30px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.42)] p-5 shadow-[0_24px_60px_hsl(var(--shadow-color)/0.08)]"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="space-y-2">
          <label htmlFor="email" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder="you@wizards.app"
            {...register("email")}
          />
          {errors.email ? <p className="text-app-danger text-xs">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="username" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder="wizard_user"
            {...register("username")}
          />
          <p className="text-app-soft text-xs">Only letters, numbers, underscores</p>
          {errors.username ? <p className="text-app-danger text-xs">{errors.username.message}</p> : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder="Create a strong password"
            {...register("password")}
          />
          {errors.password ? <p className="text-app-danger text-xs">{errors.password.message}</p> : null}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="confirmPassword"
            className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className="app-input h-12 w-full rounded-2xl border px-4 text-sm transition"
            placeholder="Repeat your password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword ? (
            <p className="text-app-danger text-xs">{errors.confirmPassword.message}</p>
          ) : null}
        </div>

        {serverError ? (
          <p className="app-danger rounded-2xl border px-4 py-3 text-sm">
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="app-button-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--primary-foreground)/0.28)] border-t-current" />
              Creating account...
            </span>
          ) : (
            <>
              Continue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <p className="text-app-muted text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-app-accent font-semibold hover:opacity-80">
          Sign in
        </Link>
      </p>
    </div>
  );
}
