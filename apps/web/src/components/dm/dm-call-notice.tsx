"use client";

import React, { useEffect } from "react";
import { PhoneOff, X } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { useDMCallStore } from "@/store/dm-call-store";

/** How long a "declined"/"unanswered" notice stays on screen before clearing itself. */
const NOTICE_VISIBLE_MS = 6_000;

/**
 * Tells the caller why a call ended — declined, unanswered or hung up — after the call UI
 * itself is gone. Mounted once by DMCallProvider.
 */
export function DmCallNotice() {
  const errorMessage = useDMCallStore((state) => state.errorMessage);
  const setErrorMessage = useDMCallStore((state) => state.setErrorMessage);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timer = window.setTimeout(() => setErrorMessage(null), NOTICE_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [errorMessage, setErrorMessage]);

  return <DmCallNoticeBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />;
}

/** Presentational half, kept separate so it can be rendered in tests without the store. */
export function DmCallNoticeBanner({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  const { t } = useI18n();

  if (!message) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-3 rounded-[22px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.96)] px-4 py-3 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.18)] backdrop-blur-xl"
      data-testid="dm-call-notice"
      role="status"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]">
        <PhoneOff className="h-4 w-4" />
      </span>
      <p className="max-w-[18rem] text-sm font-semibold text-app-foreground">{message}</p>
      <button
        aria-label={t("common.close")}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.6)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-testid="dm-call-notice-dismiss"
        onClick={onDismiss}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
