"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";

import { AuthBanner } from "@/components/auth/auth-error-levels";
import { PrimaryButton } from "@/components/auth/auth-screen";
import { useI18n } from "@/components/providers/locale-provider";
import { OAuthHandoffLayout } from "@/components/auth/oauth-handoff-layout";
import {
  buildDesktopOAuthCompletePath,
  getDesktopOAuthGoogleAuthorizationParams,
} from "@/lib/auth/desktop-oauth-start";
import {
  DESKTOP_OAUTH_BROWSER_KEY,
  readDesktopOAuthBrowserAttempt,
  startDesktopOAuthBrowserAttempt,
} from "@/lib/auth/desktop-oauth-browser";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirect";

interface DesktopOAuthStartClientProps {
  callbackUrl: string;
  requestId?: string | undefined;
}

export function DesktopOAuthStartClient({ callbackUrl, requestId }: DesktopOAuthStartClientProps) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const initialized = useRef(false);
  const starting = useRef(false);

  const startGoogleSignIn = useCallback(
    async (restart = false) => {
      if (starting.current) return;
      starting.current = true;
      setFailed(false);
      setStarted(true);
      setBlocked(false);
      try {
        const didStart = await startDesktopOAuthBrowserAttempt(
          async (attemptId) => {
            await signOut({ redirect: false });
            await signIn(
              "google",
              { callbackUrl: buildDesktopOAuthCompletePath(callbackUrl, attemptId) },
              getDesktopOAuthGoogleAuthorizationParams(),
            );
          },
          restart,
          requestId,
        );
        if (didStart !== "started") {
          setBlocked(true);
          setStarted(false);
          setCompleted(didStart === "complete");
        }
      } catch {
        setStarted(false);
        setFailed(true);
      } finally {
        starting.current = false;
      }
    },
    [callbackUrl, requestId],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void startGoogleSignIn();
  }, [startGoogleSignIn]);

  useEffect(() => {
    if (!blocked) return;
    const syncAttempt = () => {
      try {
        setCompleted(readDesktopOAuthBrowserAttempt()?.status === "complete");
      } catch {
        setFailed(true);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DESKTOP_OAUTH_BROWSER_KEY || event.key === null) syncAttempt();
    };
    syncAttempt();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [blocked]);

  return (
    <OAuthHandoffLayout
      title={t(completed ? "auth.desktopOAuth.title" : "auth.desktopOAuth.startTitle")}
      description={t(
        completed
          ? "auth.desktopOAuth.description"
          : blocked
            ? "auth.desktopOAuth.pendingBrowser"
            : "auth.desktopOAuth.startDescription",
      )}
    >
      {failed ? <AuthBanner title={t("auth.login.oauthError")} /> : null}
      {blocked && !completed ? (
        <p className="auth-description" role="status">
          {t("auth.desktopOAuth.alreadyPending")}
        </p>
      ) : null}
      {completed ? (
        <a
          className="auth-btn-primary"
          href={`whispr://open${getSafeAuthRedirectPath(callbackUrl)}`}
        >
          {t("auth.desktopOAuth.button")}
        </a>
      ) : (
        <PrimaryButton
          disabled={started && !failed}
          loading={started && !failed}
          onClick={() => void startGoogleSignIn(blocked)}
          type="button"
        >
          {failed || blocked
            ? t("auth.desktopOAuth.startRetry")
            : t("auth.desktopOAuth.startButton")}
        </PrimaryButton>
      )}
    </OAuthHandoffLayout>
  );
}
