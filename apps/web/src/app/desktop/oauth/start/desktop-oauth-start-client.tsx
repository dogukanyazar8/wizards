"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

import { BrandLogo } from "@/components/brand/brand-logo";
import {
  buildDesktopOAuthCompletePath,
  getDesktopOAuthGoogleAuthorizationParams,
} from "@/lib/auth/desktop-oauth-start";

interface DesktopOAuthStartLabels {
  badge: string;
  button: string;
  description: string;
  failed: string;
  privacy: string;
  retry: string;
  title: string;
}

interface DesktopOAuthStartClientProps {
  callbackUrl: string;
  labels: DesktopOAuthStartLabels;
}

export function DesktopOAuthStartClient({ callbackUrl, labels }: DesktopOAuthStartClientProps) {
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(true);
  const desktopCompleteCallbackUrl = useMemo(
    () => buildDesktopOAuthCompletePath(callbackUrl),
    [callbackUrl],
  );

  const beginGoogleSignIn = useCallback(
    async () =>
      signOut({ redirect: false }).then(() =>
        signIn(
          "google",
          { callbackUrl: desktopCompleteCallbackUrl },
          getDesktopOAuthGoogleAuthorizationParams(),
        ),
      ),
    [desktopCompleteCallbackUrl],
  );

  const startGoogleSignIn = useCallback(async () => {
    setFailed(false);
    setStarted(true);

    try {
      await beginGoogleSignIn();
    } catch {
      setStarted(false);
      setFailed(true);
    }
  }, [beginGoogleSignIn]);

  useEffect(() => {
    let cancelled = false;
    void beginGoogleSignIn().catch(() => {
      if (!cancelled) {
        setStarted(false);
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [beginGoogleSignIn]);

  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-5 py-10">
      <section className="app-panel w-full max-w-xl rounded-[28px] border p-8 text-center shadow-[0_32px_90px_hsl(var(--shadow-color)/0.16)]">
        <BrandLogo className="mx-auto justify-center" interactive={false} />
        <p className="text-app-soft mt-7 text-xs font-semibold uppercase tracking-[0.24em]">
          {labels.badge}
        </p>
        <h1 className="text-app-foreground mt-3 text-3xl font-semibold tracking-tight">
          {labels.title}
        </h1>
        <p className="text-app-muted mx-auto mt-3 max-w-lg text-sm leading-7">
          {labels.description}
        </p>

        {failed ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {labels.failed}
          </div>
        ) : null}

        <button
          className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_48px_hsl(var(--primary)/0.28)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.5)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 motion-reduce:hover:translate-y-0"
          disabled={started && !failed}
          onClick={() => void startGoogleSignIn()}
          type="button"
        >
          {failed ? labels.retry : labels.button}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="app-panel-soft mt-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-6 text-app-muted">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>{labels.privacy}</span>
        </div>
      </section>
    </main>
  );
}
