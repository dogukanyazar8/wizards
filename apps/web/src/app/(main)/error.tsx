"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/providers/locale-provider";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center bg-app-background">
      <div className="text-center space-y-4">
        <p className="text-app-foreground text-sm font-semibold">{t("errors.genericTitle")}</p>
        <p className="text-app-muted text-xs max-w-xs">
          {error.message || t("errors.genericDescription")}
        </p>
        <button
          onClick={reset}
          className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] transition hover:bg-[hsl(var(--primary)/0.9)]"
        >
          {t("errors.retry")}
        </button>
      </div>
    </div>
  );
}
