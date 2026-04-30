"use client";

import { useState, useTransition } from "react";
import { updateLocalePreferenceAction } from "@/lib/locale/actions";
import { type AppLocale } from "@/lib/locale";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  className?: string;
  persistSelection?: boolean;
  showMeta?: boolean;
  variant?: "compact" | "panel";
};

const LANGUAGE_OPTIONS: AppLocale[] = ["tr", "en"];

export function LanguageSwitcher({
  className,
  persistSelection = false,
  showMeta = false,
  variant = "compact",
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const applyLocale = (nextLocale: AppLocale) => {
    setLocale(nextLocale);
    setSaveError(null);
    setSaved(false);

    if (!persistSelection) {
      return;
    }

    startTransition(async () => {
      const result = await updateLocalePreferenceAction(nextLocale);

      if (!result.success) {
        setSaveError(result.error ?? "appearance.language.savingError");
        return;
      }

      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    });
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "inline-flex items-center rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.4)] p-1",
          variant === "panel" && "app-panel-soft rounded-2xl border px-1.5 py-1.5",
        )}
      >
        {LANGUAGE_OPTIONS.map((option) => {
          const active = locale === option;

          return (
            <button
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold tracking-[0.18em] transition",
                active
                  ? "bg-[hsl(var(--surface-card))] text-app-foreground shadow-[0_10px_24px_hsl(var(--shadow-color)/0.12)]"
                  : "text-app-soft hover:text-app-foreground",
              )}
              key={option}
              onClick={() => applyLocale(option)}
              type="button"
            >
              {t(`appearance.language.${option}`)}
            </button>
          );
        })}
      </div>

      {showMeta ? (
        <div className="min-h-5 text-xs">
          {isPending ? <span className="text-app-accent">{t("common.saving")}</span> : null}
          {!isPending && saved ? (
            <span className="text-app-success">{t("appearance.language.saved")}</span>
          ) : null}
          {!isPending && saveError ? (
            <span className="text-app-danger">{t(saveError)}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
