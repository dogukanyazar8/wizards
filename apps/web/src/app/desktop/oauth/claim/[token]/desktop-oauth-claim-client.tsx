"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { SplashScreen } from "@/components/splash/splash-screen";
import { AuthBanner } from "@/components/auth/auth-error-levels";
import { useI18n } from "@/components/providers/locale-provider";
import { OAuthHandoffLayout } from "@/components/auth/oauth-handoff-layout";
import { buildAuthCssVars } from "@/lib/auth/css-vars";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { claimDesktopOAuthHandoffAction } from "./actions";

interface DesktopOAuthClaimClientProps {
  callbackUrl: string;
  token: string;
}

const subscribeToDesktopRuntime = () => () => {};
const getServerDesktopRuntimeSnapshot = () => null;

export function DesktopOAuthClaimClient({ callbackUrl, token }: DesktopOAuthClaimClientProps) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const desktopRuntime = useSyncExternalStore(
    subscribeToDesktopRuntime,
    isWhisprDesktopRuntime,
    getServerDesktopRuntimeSnapshot,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submittedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    formRef.current?.requestSubmit();
  }, [desktopRuntime, token]);

  if (desktopRuntime !== false) {
    return (
      <>
        <SplashScreen step="session" surface="desktop" variant="overlay" />
        <form
          ref={formRef}
          action={async () => {
            if (submittedTokenRef.current === token) return;
            submittedTokenRef.current = token;
            setError(null);
            const result = await claimDesktopOAuthHandoffAction(token, callbackUrl);
            if (!result.success) {
              setError(result.error ?? "auth.desktopOAuth.failed");
            }
          }}
          className="sr-only"
        >
          <button type="submit">{t("auth.desktopOAuth.claimButton")}</button>
        </form>
        {error ? (
          <div
            className="fixed inset-x-4 bottom-4 z-[1001] mx-auto max-w-md"
            style={buildAuthCssVars("desktop")}
          >
            <AuthBanner
              title={
                error === "auth.desktopOAuth.invalid"
                  ? t("auth.desktopOAuth.invalid")
                  : t("auth.desktopOAuth.failed")
              }
            />
            <Link className="auth-btn-primary" href="/login">
              {t("auth.common.backToLogin")}
            </Link>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <OAuthHandoffLayout
      title={t("auth.desktopOAuth.claimBrowserTitle")}
      description={t("auth.desktopOAuth.claimBrowserDescription")}
    />
  );
}
