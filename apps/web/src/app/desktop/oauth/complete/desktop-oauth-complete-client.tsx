"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

import { useI18n } from "@/components/providers/locale-provider";
import { OAuthHandoffLayout } from "@/components/auth/oauth-handoff-layout";
import { AuthBanner } from "@/components/auth/auth-error-levels";
import { completeDesktopOAuthBrowserAttempt } from "@/lib/auth/desktop-oauth-browser";

const DESKTOP_HANDOFF_DELAY_MS = 250;
const BROWSER_TAB_CLOSE_DELAY_MS = 1600;

interface DesktopOAuthCompleteClientProps {
  callbackUrl: string;
  desktopHandoffUrl: string;
  attemptId?: string | undefined;
}

export function DesktopOAuthCompleteClient({
  callbackUrl,
  desktopHandoffUrl,
  attemptId,
}: DesktopOAuthCompleteClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const closeTimeoutRef = useRef<number | null>(null);
  const [superseded, setSuperseded] = useState(false);

  const clearBrowserCloseTimers = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleBrowserTabClose = useCallback(() => {
    clearBrowserCloseTimers();

    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      window.open("", "_self");
      window.close();
    }, BROWSER_TAB_CLOSE_DELAY_MS);
  }, [clearBrowserCloseTimers]);

  const requestDesktopHandoff = useCallback(() => {
    if (attemptId) {
      try {
        if (!completeDesktopOAuthBrowserAttempt(attemptId)) {
          setSuperseded(true);
          return;
        }
      } catch {
        setSuperseded(true);
        return;
      }
    }
    window.location.href = desktopHandoffUrl;
    scheduleBrowserTabClose();
  }, [attemptId, desktopHandoffUrl, scheduleBrowserTabClose]);

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
    <OAuthHandoffLayout
      title={t("auth.desktopOAuth.title")}
      description={t("auth.desktopOAuth.description")}
    >
      {superseded ? (
        <AuthBanner title={t("auth.desktopOAuth.superseded")} />
      ) : (
        <a
          className="auth-btn-primary"
          href={desktopHandoffUrl}
          onClick={(event) => {
            event.preventDefault();
            requestDesktopHandoff();
          }}
        >
          {t("auth.desktopOAuth.button")}
        </a>
      )}
    </OAuthHandoffLayout>
  );
}
