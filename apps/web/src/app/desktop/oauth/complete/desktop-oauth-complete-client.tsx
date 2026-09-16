"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";

import { useI18n } from "@/components/providers/locale-provider";
import { OAuthHandoffLayout } from "@/components/auth/oauth-handoff-layout";

const DESKTOP_HANDOFF_DELAY_MS = 250;
const BROWSER_TAB_CLOSE_DELAY_MS = 1600;

interface DesktopOAuthCompleteClientProps {
  callbackUrl: string;
  desktopHandoffUrl: string;
}

export function DesktopOAuthCompleteClient({
  callbackUrl,
  desktopHandoffUrl,
}: DesktopOAuthCompleteClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const closeTimeoutRef = useRef<number | null>(null);

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
    <OAuthHandoffLayout
      title={t("auth.desktopOAuth.title")}
      description={t("auth.desktopOAuth.description")}
    >
      <a className="auth-btn-primary" href={desktopHandoffUrl} onClick={scheduleBrowserTabClose}>
        {t("auth.desktopOAuth.button")}
      </a>
    </OAuthHandoffLayout>
  );
}
