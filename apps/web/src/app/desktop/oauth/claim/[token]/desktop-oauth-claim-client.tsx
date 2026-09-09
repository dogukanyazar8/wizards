"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";

import { SplashScreen } from "@/components/splash/splash-screen";
import { BrandLogo } from "@/components/brand/brand-logo";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { claimDesktopOAuthHandoffAction } from "./actions";

interface DesktopOAuthClaimLabels {
  browserDescription: string;
  browserTitle: string;
  button: string;
  failed: string;
  invalid: string;
  privacy: string;
}

interface DesktopOAuthClaimClientProps {
  callbackUrl: string;
  labels: DesktopOAuthClaimLabels;
  token: string;
}

const subscribeToDesktopRuntime = () => () => {};
const getServerDesktopRuntimeSnapshot = () => null;

export function DesktopOAuthClaimClient({
  callbackUrl,
  labels,
  token,
}: DesktopOAuthClaimClientProps) {
  const [error, setError] = useState<string | null>(null);
  const desktopRuntime = useSyncExternalStore(
    subscribeToDesktopRuntime,
    isWhisprDesktopRuntime,
    getServerDesktopRuntimeSnapshot,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    formRef.current?.requestSubmit();
  }, [desktopRuntime]);

  if (desktopRuntime !== false) {
    return (
      <>
        <SplashScreen step="session" surface="desktop" variant="overlay" />
        <form
          ref={formRef}
          action={async () => {
            const result = await claimDesktopOAuthHandoffAction(token, callbackUrl);
            if (!result.success) {
              setError(result.error ?? "auth.desktopOAuth.failed");
            }
          }}
          className="sr-only"
        >
          <button type="submit">{labels.button}</button>
        </form>
        {error ? (
          <div className="fixed inset-x-4 bottom-4 z-[1001] mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-lg">
            {error === "auth.desktopOAuth.invalid" ? labels.invalid : labels.failed}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <main className="auth-canvas flex min-h-screen items-center justify-center px-5 py-10">
      <section className="app-panel w-full max-w-lg rounded-[28px] border p-8 text-center shadow-[0_32px_90px_hsl(var(--shadow-color)/0.16)]">
        <BrandLogo className="mx-auto justify-center" interactive={false} />
        <h1 className="text-app-foreground mt-7 text-2xl font-semibold tracking-tight">
          {labels.browserTitle}
        </h1>
        <p className="text-app-muted mx-auto mt-3 max-w-md text-sm leading-7">
          {labels.browserDescription}
        </p>
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
