"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, MonitorUp, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

const DESKTOP_HANDOFF_DELAY_MS = 250;
const BROWSER_TAB_CLOSE_DELAY_MS = 1600;
const BROWSER_TAB_CLOSE_FALLBACK_MS = 700;

interface DesktopOAuthCompleteLabels {
  badge: string;
  browserHint: string;
  button: string;
  closeButton: string;
  closeHint: string;
  description: string;
  privacy: string;
  title: string;
}

interface DesktopOAuthCompleteClientProps {
  callbackUrl: string;
  desktopHandoffUrl: string;
  labels: DesktopOAuthCompleteLabels;
}

export function DesktopOAuthCompleteClient({
  callbackUrl,
  desktopHandoffUrl,
  labels,
}: DesktopOAuthCompleteClientProps) {
  const router = useRouter();
  const [openRequested, setOpenRequested] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const closeFallbackTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const clearBrowserCloseTimers = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (closeFallbackTimeoutRef.current !== null) {
      window.clearTimeout(closeFallbackTimeoutRef.current);
      closeFallbackTimeoutRef.current = null;
    }
  }, []);

  const tryCloseBrowserTab = useCallback(() => {
    setCloseBlocked(false);
    window.open("", "_self");
    window.close();

    closeFallbackTimeoutRef.current = window.setTimeout(() => {
      closeFallbackTimeoutRef.current = null;
      setCloseBlocked(true);
    }, BROWSER_TAB_CLOSE_FALLBACK_MS);
  }, []);

  const scheduleBrowserTabClose = useCallback(() => {
    clearBrowserCloseTimers();

    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      tryCloseBrowserTab();
    }, BROWSER_TAB_CLOSE_DELAY_MS);
  }, [clearBrowserCloseTimers, tryCloseBrowserTab]);

  const requestDesktopHandoff = useCallback(() => {
    setOpenRequested(true);
    window.location.href = desktopHandoffUrl;
    scheduleBrowserTabClose();
  }, [desktopHandoffUrl, scheduleBrowserTabClose]);

  useEffect(() => {
    if (isWhisprDesktopRuntime()) {
      router.replace(callbackUrl);
      return;
    }

    const timeoutId = window.setTimeout(requestDesktopHandoff, DESKTOP_HANDOFF_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      clearBrowserCloseTimers();
    };
  }, [callbackUrl, clearBrowserCloseTimers, requestDesktopHandoff, router]);

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

        <a
          className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_18px_48px_hsl(var(--primary)/0.28)] transition hover:-translate-y-0.5 hover:opacity-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.5)] focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
          href={desktopHandoffUrl}
          onClick={() => {
            setOpenRequested(true);
            scheduleBrowserTabClose();
          }}
        >
          <MonitorUp className="h-4 w-4" aria-hidden="true" />
          {labels.button}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>

        {openRequested ? (
          <div className="mt-4 rounded-2xl bg-[hsl(var(--primary)/0.08)] px-4 py-3 text-sm font-medium text-[hsl(var(--primary))]">
            <p>{labels.browserHint}</p>
            <p className="mt-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              {labels.closeHint}
            </p>
            {closeBlocked ? (
              <button
                className="mt-3 inline-flex min-h-9 items-center justify-center rounded-xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--background)/0.74)] px-3 text-xs font-bold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.1)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.45)]"
                onClick={tryCloseBrowserTab}
                type="button"
              >
                {labels.closeButton}
              </button>
            ) : null}
          </div>
        ) : null}

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
