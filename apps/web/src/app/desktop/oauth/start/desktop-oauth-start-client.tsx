"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn, signOut } from "next-auth/react";

import { AuthBanner } from "@/components/auth/auth-error-levels";
import { PrimaryButton } from "@/components/auth/auth-screen";
import { useI18n } from "@/components/providers/locale-provider";
import { OAuthHandoffLayout } from "@/components/auth/oauth-handoff-layout";
import {
  buildDesktopOAuthCompletePath,
  getDesktopOAuthGoogleAuthorizationParams,
} from "@/lib/auth/desktop-oauth-start";

interface DesktopOAuthStartClientProps {
  callbackUrl: string;
}

export function DesktopOAuthStartClient({ callbackUrl }: DesktopOAuthStartClientProps) {
  const { t } = useI18n();
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
    <OAuthHandoffLayout
      title={t("auth.desktopOAuth.startTitle")}
      description={t("auth.desktopOAuth.startDescription")}
    >
      {failed ? <AuthBanner title={t("auth.login.oauthError")} /> : null}
      <PrimaryButton
        disabled={started && !failed}
        loading={started && !failed}
        onClick={() => void startGoogleSignIn()}
        type="button"
      >
        {failed ? t("auth.desktopOAuth.startRetry") : t("auth.desktopOAuth.startButton")}
      </PrimaryButton>
    </OAuthHandoffLayout>
  );
}
