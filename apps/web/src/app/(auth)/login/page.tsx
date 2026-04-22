"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@wizards/types";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { loginAction } from "@/lib/auth/actions";

type OAuthProvider = "github" | "google";

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

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

    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);

    const result = await loginAction(formData);

    if (!result.success) {
      setServerError(result.error ?? "Unable to log in right now");
    }
  };

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setServerError(null);
    setOauthLoading(provider);

    try {
      await signIn(provider, { callbackUrl: "/channels/@me" });
    } catch {
      setServerError("OAuth sign-in failed. Please try again.");
      setOauthLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-xl font-extrabold text-indigo-300">
          W
        </div>
        <h1 className="text-2xl font-semibold text-slate-100">Welcome back!</h1>
        <p className="mt-1 text-sm text-slate-400">We&apos;re so excited to see you again!</p>
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
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            placeholder="you@wizards.app"
            {...register("email")}
          />
          {errors.email ? <p className="text-xs text-rose-400">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-500"
            placeholder="Enter your password"
            {...register("password")}
          />
          {errors.password ? <p className="text-xs text-rose-400">{errors.password.message}</p> : null}
        </div>

        <div className="text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
            Forgot your password?
          </Link>
        </div>

        {serverError ? (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Logging in...
            </span>
          ) : (
            "Log In"
          )}
        </button>
      </form>

      <div className="space-y-3">
        <div className="relative text-center text-xs uppercase tracking-wide text-slate-500">
          <span className="bg-slate-900 px-2">or continue with</span>
          <div className="absolute left-0 top-1/2 -z-10 h-px w-full bg-slate-800" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("github")}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {oauthLoading === "github" ? "Loading..." : "GitHub"}
          </button>

          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("google")}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {oauthLoading === "google" ? "Loading..." : "Google"}
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-slate-400">
        Need an account?{" "}
        <Link href="/register" className="font-semibold text-indigo-300 hover:text-indigo-200">
          Register
        </Link>
      </p>
    </div>
  );
}
