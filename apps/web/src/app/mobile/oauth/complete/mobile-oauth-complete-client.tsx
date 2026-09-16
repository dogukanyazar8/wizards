"use client";

import { useCallback, useEffect, useRef } from "react";

import { OAuthHandoffLayout } from "@/components/auth/oauth-handoff-layout";
import { useI18n } from "@/components/providers/locale-provider";

const MOBILE_HANDOFF_DELAY_MS = 250;
const BROWSER_TAB_CLOSE_DELAY_MS = 1400;

interface MobileOAuthCompleteClientProps {
  appHandoffUrl: string;
}

export function MobileOAuthCompleteClient({ appHandoffUrl }: MobileOAuthCompleteClientProps) {
  const { t } = useI18n();
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

  const requestMobileHandoff = useCallback(() => {
    window.location.href = appHandoffUrl;
    scheduleBrowserTabClose();
  }, [appHandoffUrl, scheduleBrowserTabClose]);

  useEffect(() => {
    const timeoutId = window.setTimeout(requestMobileHandoff, MOBILE_HANDOFF_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      clearBrowserCloseTimers();
    };
  }, [clearBrowserCloseTimers, requestMobileHandoff]);

  return (
    <OAuthHandoffLayout
      title={t("auth.mobileOAuth.title")}
      description={t("auth.mobileOAuth.description")}
    >
      <a className="auth-btn-primary" href={appHandoffUrl} onClick={scheduleBrowserTabClose}>
        {t("auth.mobileOAuth.button")}
      </a>
    </OAuthHandoffLayout>
  );
}
