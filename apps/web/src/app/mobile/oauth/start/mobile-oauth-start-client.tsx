"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn, signOut } from "next-auth/react";

import { AuthBanner } from "@/components/auth/auth-error-levels";
import { PrimaryButton } from "@/components/auth/auth-screen";
import { useI18n } from "@/components/providers/locale-provider";
import { OAuthHandoffLayout } from "@/components/auth/oauth-handoff-layout";
import {
  buildMobileOAuthCompletePath,
  getMobileOAuthGoogleAuthorizationParams,
  type MobileOAuthProvider,
} from "@/lib/auth/mobile-oauth-start";

interface MobileOAuthStartClientProps {
  callbackUrl: string;
  provider: MobileOAuthProvider;
  state: string;
}

export function MobileOAuthStartClient({
  callbackUrl,
  provider,
  state,
}: MobileOAuthStartClientProps) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(true);
  const mobileCompleteCallbackUrl = useMemo(
    () => buildMobileOAuthCompletePath(callbackUrl, state),
    [callbackUrl, state],
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
    <OAuthHandoffLayout
      title={t("auth.desktopOAuth.startTitle")}
      description={t("auth.mobileOAuth.startDescription")}
    >
      {failed ? <AuthBanner title={t("auth.login.oauthError")} /> : null}
      <PrimaryButton
        disabled={started && !failed}
        loading={started && !failed}
        onClick={() => void startProviderSignIn()}
        type="button"
      >
        {failed ? t("auth.desktopOAuth.startRetry") : t("auth.desktopOAuth.startButton")}
      </PrimaryButton>
    </OAuthHandoffLayout>
  );
}
