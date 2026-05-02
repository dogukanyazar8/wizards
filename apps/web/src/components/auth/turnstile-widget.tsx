"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";

type TurnstileWidgetProps = {
  onTokenChange: (token: string) => void;
  siteKey: string;
};

type TurnstileApi = {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      "error-callback": () => void;
      "expired-callback": () => void;
      action: string;
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

export function TurnstileWidget({ onTokenChange, siteKey }: TurnstileWidgetProps) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    if (window.turnstile) {
      setScriptReady(true);
    }
  }, []);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) {
      return;
    }

    if (widgetIdRef.current) {
      removeTurnstileWidget(widgetIdRef.current);
      widgetIdRef.current = null;
      onTokenChange("");
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      "error-callback": () => {
        onTokenChange("");
      },
      "expired-callback": () => {
        onTokenChange("");
      },
      action: "register",
      callback: (token) => {
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
  }, [locale, onTokenChange, scriptReady, siteKey]);

  if (!siteKey) {
    return (
      <div
        className="rounded-2xl border border-[hsl(var(--danger)/0.35)] bg-[hsl(var(--danger)/0.08)] px-4 py-3 text-sm text-[hsl(var(--danger))]"
        role="alert"
      >
        {t("auth.turnstile.notConfigured")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Script
        id="cloudflare-turnstile"
        onError={() => {
          setScriptFailed(true);
          onTokenChange("");
        }}
        onLoad={() => setScriptReady(true)}
        src={TURNSTILE_SCRIPT_SRC}
        strategy="afterInteractive"
      />
      <div
        aria-busy={!scriptReady && !scriptFailed}
        aria-label={t("auth.turnstile.label")}
        className="overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.32)] p-3"
      >
        <div className="min-h-[65px]" ref={containerRef} />
        {!scriptReady && !scriptFailed ? (
          <p className="text-app-soft text-xs" role="status">
            {t("auth.turnstile.loading")}
          </p>
        ) : null}
        {scriptFailed ? (
          <p className="text-app-danger text-xs" role="alert">
            {t("auth.turnstile.unavailable")}
          </p>
        ) : null}
      </div>
      <p className="text-app-soft text-xs">{t("auth.turnstile.help")}</p>
    </div>
  );
}
