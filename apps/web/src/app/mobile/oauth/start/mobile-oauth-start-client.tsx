"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

import { BrandLogo } from "@/components/brand/brand-logo";
import {
  buildMobileOAuthCompletePath,
  getMobileOAuthGoogleAuthorizationParams,
  type MobileOAuthProvider,
} from "@/lib/auth/mobile-oauth-start";

interface MobileOAuthStartClientProps {
  callbackUrl: string;
  provider: MobileOAuthProvider;
}

export function MobileOAuthStartClient({ callbackUrl, provider }: MobileOAuthStartClientProps) {
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(true);
  const mobileCompleteCallbackUrl = useMemo(
    () => buildMobileOAuthCompletePath(callbackUrl),
    [callbackUrl],
  );

  const beginProviderSignIn = useCallback(async () => {
    // Sign the browser session out first so the account chooser always shows;
    // the mobile app never inherits a stale web session this way.
    return signOut({ redirect: false }).then(() =>
      signIn(
        provider,
        { callbackUrl: mobileCompleteCallbackUrl },
        getMobileOAuthGoogleAuthorizationParams(),
      ),
    );
  }, [mobileCompleteCallbackUrl, provider]);

  const startProviderSignIn = useCallback(async () => {
    setFailed(false);
    setStarted(true);

    try {
      await beginProviderSignIn();
    } catch {
      setStarted(false);
      setFailed(true);
    }
  }, [beginProviderSignIn]);

  useEffect(() => {
    let cancelled = false;
    void beginProviderSignIn().catch(() => {
      if (!cancelled) {
        setStarted(false);
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [beginProviderSignIn]);

  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-5 py-10">
      <section className="app-panel w-full max-w-xl rounded-[28px] border p-8 text-center shadow-[0_32px_90px_hsl(var(--shadow-color)/0.16)]">
        <BrandLogo className="mx-auto justify-center" interactive={false} />
        <p className="text-app-soft mt-7 text-xs font-semibold uppercase tracking-[0.24em]">
          MOBIL GUVENLI GIRIS
        </p>
        <h1 className="text-app-foreground mt-3 text-3xl font-semibold tracking-tight">
          Guvenli Google girisi
        </h1>
        <p className="text-app-muted mx-auto mt-3 max-w-lg text-sm leading-7">
          Google hesap secimi aciliyor. Girisi tamamladiginda Whispr Mobile uygulamasina otomatik
          donersin.
        </p>

        {failed ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            Google girisi baslatilamadi. Lutfen tekrar dene.
          </div>
        ) : null}

        <button
          className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_48px_hsl(var(--primary)/0.28)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.5)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 motion-reduce:hover:translate-y-0"
          disabled={started && !failed}
          onClick={() => void startProviderSignIn()}
          type="button"
        >
          {failed ? "Google girisini yeniden baslat" : "Google ile devam et"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="app-panel-soft mt-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-6 text-app-muted">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            OAuth kodu ve provider tokeni tarayicida kalir. Mobil uygulamaya yalnizca kisa omurlu ve
            tek kullanimlik bir handoff verilir.
          </span>
        </div>
      </section>
    </main>
  );
}
