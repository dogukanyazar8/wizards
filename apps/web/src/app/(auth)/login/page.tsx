"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@wizards/types";
import { ArrowRight, KeyRound, Sparkles } from "lucide-react";
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
    setValue,
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
      await signIn(provider, { callbackUrl: "/channels" });
    } catch {
      setServerError("OAuth sign-in failed. Please try again.");
      setOauthLoading(null);
    }
  };

  const applyTestAccount = (email: string) => {
    setValue("email", email, { shouldDirty: true, shouldTouch: true });
    setValue("password", "password123", { shouldDirty: true, shouldTouch: true });
    setServerError(null);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border)/0.75)] bg-[hsl(var(--surface-soft)/0.4)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-[hsl(var(--primary))]">
          <Sparkles className="h-3.5 w-3.5" />
          Sign In
        </div>
        <div>
          <h1 className="text-app-foreground text-4xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-app-muted mt-3 text-sm leading-7">
            Log in to jump straight into your servers, continue the conversation, and test multi-user flows without friction.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          className="group rounded-[26px] border border-[hsl(var(--border)/0.7)] bg-[linear-gradient(145deg,hsl(var(--surface-card)/0.78),hsl(var(--surface-soft)/0.4))] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)] hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)]"
          onClick={() => applyTestAccount("demo@wizards.app")}
          type="button"
        >
          <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">Demo Account</p>
          <p className="text-app-foreground mt-2 text-sm font-semibold">demo@wizards.app</p>
          <p className="text-app-muted mt-1 text-xs">Prefills demo credentials instantly.</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--primary))]">
              Fast start
            </span>
            <span className="text-app-soft text-[11px]">Shared demo workspace</span>
          </div>
        </button>
        <button
          className="group rounded-[26px] border border-[hsl(var(--border)/0.7)] bg-[linear-gradient(145deg,hsl(var(--surface-card)/0.78),hsl(var(--surface-soft)/0.4))] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)] hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)]"
          onClick={() => applyTestAccount("test@wizards.app")}
          type="button"
        >
          <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">Test Account</p>
          <p className="text-app-foreground mt-2 text-sm font-semibold">test@wizards.app</p>
          <p className="text-app-muted mt-1 text-xs">Use this for second-session chat testing.</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--primary))]">
              Multi-user
            </span>
            <span className="text-app-soft text-[11px]">Ideal for invite flows</span>
          </div>
        </button>
      </div>

      <form className="space-y-5 rounded-[30px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.42)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)]" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-2">
          <label htmlFor="email" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="text-app-foreground h-12 w-full rounded-2xl border border-[hsl(var(--border)/0.75)] bg-[hsl(var(--surface-soft)/0.38)] px-4 text-sm outline-none transition focus:border-[hsl(var(--primary)/0.7)] focus:ring-4 focus:ring-[hsl(var(--primary)/0.1)]"
            placeholder="you@wizards.app"
            {...register("email")}
          />
          {errors.email ? <p className="text-xs text-rose-400">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-[hsl(var(--primary))] hover:opacity-80">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <KeyRound className="text-app-soft pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="text-app-foreground h-12 w-full rounded-2xl border border-[hsl(var(--border)/0.75)] bg-[hsl(var(--surface-soft)/0.38)] pl-11 pr-4 text-sm outline-none transition focus:border-[hsl(var(--primary)/0.7)] focus:ring-4 focus:ring-[hsl(var(--primary)/0.1)]"
              placeholder="Enter your password"
              {...register("password")}
            />
          </div>
          {errors.password ? <p className="text-xs text-rose-400">{errors.password.message}</p> : null}
        </div>

        {serverError ? (
          <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {serverError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-current" />
              Logging in...
            </span>
          ) : (
            <>
              Continue to Wizards
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="space-y-3">
        <div className="text-app-soft relative text-center text-xs uppercase tracking-[0.24em]">
          <span className="bg-transparent px-2">or continue with</span>
          <div className="absolute left-0 top-1/2 -z-10 h-px w-full bg-[hsl(var(--border)/0.72)]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("github")}
            className="text-app-foreground h-12 rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.3)] px-3 text-sm font-medium transition hover:border-[hsl(var(--border)/0.98)] hover:bg-[hsl(var(--surface-soft)/0.55)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {oauthLoading === "github" ? "Loading..." : "GitHub"}
          </button>

          <button
            type="button"
            disabled={oauthLoading !== null}
            onClick={() => handleOAuthSignIn("google")}
            className="text-app-foreground h-12 rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.3)] px-3 text-sm font-medium transition hover:border-[hsl(var(--border)/0.98)] hover:bg-[hsl(var(--surface-soft)/0.55)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {oauthLoading === "google" ? "Loading..." : "Google"}
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.55),hsl(var(--surface-soft)/0.32))] p-4">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">Need an account?</p>
        <p className="text-app-muted mt-2 text-sm leading-7">
          Create a new profile and start testing servers, invites, and channel flows with your own workspace.
        </p>
        <Link
          href="/register"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] hover:opacity-80"
        >
          Create your account
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
