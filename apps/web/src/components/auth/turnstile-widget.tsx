"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { AuthTurnstileRow } from "@/components/auth/auth-pieces";
import { useI18n } from "@/components/providers/locale-provider";
import type { TurnstileAction } from "@/lib/auth/turnstile";
import { E2E_TURNSTILE_TOKEN, isE2ETurnstileBypassEnabled } from "@/lib/auth/turnstile-e2e";

type TurnstileWidgetProps = {
  action?: TurnstileAction;
  onTokenChange: (token: string) => void;
  siteKey: string;
  compact?: boolean;
  verified?: boolean;
};

type TurnstileApi = {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      "error-callback": () => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
      "unsupported-callback": () => void;
      "before-interactive-callback": () => void;
      "after-interactive-callback": () => void;
      action: string;
      appearance: "always" | "interaction-only";
      callback: (token: string) => void;
      language: string;
      sitekey: string;
      theme: "auto";
    },
  ) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function removeTurnstileWidget(widgetId: string | null) {
  if (!widgetId || !window.turnstile) {
    return;
  }

  try {
    window.turnstile.remove(widgetId);
  } catch {
    // Turnstile can already be detached during fast route changes.
  }
}

export function TurnstileWidget({
  action = "register",
  onTokenChange,
  siteKey,
  compact = false,
  verified = false,
}: TurnstileWidgetProps) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const isE2EBypass = isE2ETurnstileBypassEnabled();

  useEffect(() => {
    if (!isE2EBypass) {
      return;
    }

    onTokenChange(E2E_TURNSTILE_TOKEN);

    return () => {
      onTokenChange("");
    };
  }, [isE2EBypass, onTokenChange]);

  useEffect(() => {
    if (isE2EBypass) {
      return;
    }

    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) {
      return;
    }

    if (widgetIdRef.current) {
      removeTurnstileWidget(widgetIdRef.current);
      widgetIdRef.current = null;
      onTokenChange("");
    }

    const handleChallengeError = () => {
      setChallengeFailed(true);
      onTokenChange("");
    };

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      "before-interactive-callback": () => {
        setInteractive(true);
        onTokenChange("");
      },
      "after-interactive-callback": () => setInteractive(false),
      "error-callback": handleChallengeError,
      "expired-callback": () => {
        onTokenChange("");
      },
      "timeout-callback": handleChallengeError,
      "unsupported-callback": handleChallengeError,
      action,
      appearance: compact ? "interaction-only" : "always",
      callback: (token) => {
        setInteractive(false);
        setChallengeFailed(false);
        onTokenChange(token);
      },
      language: locale,
      sitekey: siteKey,
      theme: "auto",
    });

    return () => {
      removeTurnstileWidget(widgetIdRef.current);
      widgetIdRef.current = null;
      onTokenChange("");
    };
  }, [action, compact, isE2EBypass, locale, onTokenChange, scriptReady, siteKey]);

  if (isE2EBypass) {
    return null;
  }

  if (!siteKey) {
    return (
      <div className="auth-reference-turnstile-state is-error" role="alert">
        {t("auth.turnstile.notConfigured")}
      </div>
    );
  }

  return (
    <div className="auth-reference-turnstile-shell" data-compact={compact || undefined}>
      <Script
        id="cloudflare-turnstile"
        onError={() => {
          setScriptFailed(true);
          onTokenChange("");
        }}
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
        src={TURNSTILE_SCRIPT_SRC}
        strategy="afterInteractive"
      />
      <div
        aria-busy={!scriptReady && !scriptFailed}
        aria-label={t("auth.turnstile.label")}
        className={compact ? "auth-turnstile-group" : "auth-reference-turnstile-box"}
        role="group"
      >
        {compact && !interactive ? <AuthTurnstileRow verified={verified} /> : null}
        <div className="auth-reference-turnstile-mount" ref={containerRef} />
        {!scriptReady && !scriptFailed ? (
          <p className="auth-reference-turnstile-state" role="status">
            {t("auth.turnstile.loading")}
          </p>
        ) : null}
        {scriptFailed || challengeFailed ? (
          <p className="auth-reference-turnstile-state is-error" role="alert">
            {t("auth.turnstile.unavailable")}
          </p>
        ) : null}
      </div>
      {compact ? null : <p className="auth-reference-turnstile-help">{t("auth.turnstile.help")}</p>}
    </div>
  );
}
