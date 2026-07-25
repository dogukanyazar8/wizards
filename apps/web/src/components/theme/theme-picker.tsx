"use client";

import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { updateThemePreferenceAction } from "@/lib/appearance/actions";
import {
  ADVANCED_WIZARDS_THEMES,
  DEFAULT_WIZARDS_THEME,
  SIMPLE_WIZARDS_THEMES,
  THEME_PICKER_TABS,
  applyWizardsThemeToDocument,
  getThemePreviewBackground,
  normalizeWizardsThemeId,
  type WizardsThemeCategory,
  type WizardsThemeDefinition,
  type WizardsThemeId,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

type ThemePickerProps = {
  className?: string;
  persistSelection?: boolean;
  variant?: "compact" | "page";
};

type ThemeSwatchButtonProps = {
  onSelect: (themeId: WizardsThemeId) => void;
  selected: boolean;
  theme: WizardsThemeDefinition;
  variant: "advanced-compact" | "card" | "simple-compact";
};

const subscribeToHydration = () => () => {};

function ThemeSwatchButton({ onSelect, selected, theme, variant }: ThemeSwatchButtonProps) {
  const { t } = useI18n();
  const background = getThemePreviewBackground(theme.preview);
  const isLight = theme.id === "theme-light";
  const label = t(`themes.labels.${theme.id}`);
  const description = t(`themes.descriptions.${theme.id}`);

  if (variant === "simple-compact") {
    return (
      <button
        className="group flex flex-col items-center gap-1 text-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        data-selected={selected ? "true" : "false"}
        data-testid={`theme-option-${theme.id}`}
        onClick={() => onSelect(theme.id)}
        type="button"
      >
        <span
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-full border transition duration-150",
            selected
              ? "border-[hsl(var(--primary))] shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]"
              : isLight
                ? "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]"
                : "border-[hsl(var(--border)/0.8)] hover:border-[hsl(var(--primary)/0.5)]",
          )}
          style={{ background }}
        >
          {selected ? (
            <span className="absolute -right-1 -top-1 rounded-full border border-[hsl(var(--surface-card)/0.92)] bg-[hsl(var(--primary))] p-1 text-[hsl(var(--primary-foreground))]">
              <Check className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </span>
        <span className="text-app-soft text-[10px] font-medium">{label}</span>
      </button>
    );
  }

  if (variant === "advanced-compact") {
    return (
      <button
        aria-label={label}
        className={cn(
          "relative h-7 w-7 rounded-full border transition duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
          selected
            ? "border-[hsl(var(--primary))] shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]"
            : "border-[hsl(var(--border)/0.72)] hover:border-[hsl(var(--primary)/0.45)]",
        )}
        data-selected={selected ? "true" : "false"}
        data-testid={`theme-option-${theme.id}`}
        onClick={() => onSelect(theme.id)}
        style={{ background }}
        title={label}
        type="button"
      >
        {selected ? (
          <span className="text-app-foreground absolute inset-0 flex items-center justify-center rounded-full bg-[hsl(var(--backdrop)/0.18)]">
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      className={cn(
        "group app-panel flex items-center gap-2.5 rounded-[15px] border p-2.5 text-left transition duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        selected
          ? "border-[hsl(var(--primary)/0.55)] shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]"
          : "hover:border-[hsl(var(--primary)/0.35)] hover:bg-[hsl(var(--surface-soft)/0.44)]",
      )}
      data-selected={selected ? "true" : "false"}
      data-testid={`theme-option-${theme.id}`}
      onClick={() => onSelect(theme.id)}
      type="button"
    >
      <span
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          isLight ? "border-[hsl(var(--border))]" : "border-[hsl(var(--border)/0.78)]",
        )}
        style={{ background }}
      >
        {selected ? (
          <span className="absolute -right-1 -top-1 rounded-full border border-[hsl(var(--surface-card)/0.92)] bg-[hsl(var(--primary))] p-1 text-[hsl(var(--primary-foreground))]">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-app-foreground block text-xs font-semibold">{label}</span>
        <span className="text-app-muted mt-0.5 block text-[11px] leading-4">{description}</span>
      </span>
    </button>
  );
}

export function ThemePicker({
  className,
  persistSelection = false,
  variant = "page",
}: ThemePickerProps) {
  const { t } = useI18n();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [activeTab, setActiveTab] = useState<WizardsThemeCategory>("simple");
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [optimisticTheme, setOptimisticTheme] = useState<WizardsThemeId | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTheme, setSavedTheme] = useState<WizardsThemeId | null>(null);
  const [isPending, startTransition] = useTransition();

  const providerThemeId = mounted
    ? normalizeWizardsThemeId(theme ?? resolvedTheme)
    : DEFAULT_WIZARDS_THEME;
  const activeThemeId =
    optimisticTheme && optimisticTheme !== providerThemeId ? optimisticTheme : providerThemeId;

  const applyTheme = (themeId: WizardsThemeId) => {
    const nextTheme = applyWizardsThemeToDocument(themeId);

    setOptimisticTheme(nextTheme);
    setTheme(nextTheme);
    setSaveError(null);

    if (!persistSelection) {
      return;
    }

    startTransition(async () => {
      const result = await updateThemePreferenceAction(themeId);

      if (!result.success) {
        setSaveError(result.error ?? "themes.status.error");
        return;
      }

      setSavedTheme(result.theme ?? themeId);
    });
  };

  useEffect(() => {
    if (!savedTheme || savedTheme !== activeThemeId) {
      return;
    }

    const timeout = window.setTimeout(() => setSavedTheme(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [activeThemeId, savedTheme]);

  if (variant === "compact") {
    const activeThemes = activeTab === "simple" ? SIMPLE_WIZARDS_THEMES : ADVANCED_WIZARDS_THEMES;

    return (
      <div
        className={cn(
          "app-overlay w-[min(92vw,18rem)] rounded-[18px] border p-2 shadow-[0_16px_38px_hsl(var(--shadow-color)/0.14)] backdrop-blur-xl",
          className,
        )}
      >
        <div className="app-panel rounded-[16px] border p-2">
          <div className="mb-2 flex rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] p-1">
            {THEME_PICKER_TABS.map((tab) => (
              <button
                className={cn(
                  "flex-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition",
                  activeTab === tab.id
                    ? "bg-[hsl(var(--surface-card))] text-app-foreground shadow-[0_12px_30px_hsl(var(--shadow-color)/0.12)]"
                    : "text-app-soft hover:text-app-foreground",
                )}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {t(`themes.tabs.${tab.id}`)}
              </button>
            ))}
          </div>

          {activeTab === "simple" ? (
            <div className="grid grid-cols-4 gap-2">
              {activeThemes.map((themeOption) => (
                <ThemeSwatchButton
                  key={themeOption.id}
                  onSelect={applyTheme}
                  selected={activeThemeId === themeOption.id}
                  theme={themeOption}
                  variant="simple-compact"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-1.5">
              {activeThemes.map((themeOption) => (
                <ThemeSwatchButton
                  key={themeOption.id}
                  onSelect={applyTheme}
                  selected={activeThemeId === themeOption.id}
                  theme={themeOption}
                  variant="advanced-compact"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)} data-testid="theme-picker">
      <section className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.18em]">
              {t("themes.page.simpleEyebrow")}
            </p>
            <h3 className="text-app-foreground mt-1.5 text-base font-semibold">
              {t("themes.page.simpleTitle")}
            </h3>
            <p className="text-app-muted mt-1 text-xs leading-5">
              {t("themes.page.simpleDescription")}
            </p>
          </div>
          <div className="text-right text-xs">
            {isPending ? (
              <span className="text-app-accent font-medium">{t("themes.status.saving")}</span>
            ) : savedTheme ? (
              <span className="text-app-success font-medium">{t("themes.status.saved")}</span>
            ) : null}
            {saveError ? <p className="text-app-danger mt-1 max-w-40">{t(saveError)}</p> : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SIMPLE_WIZARDS_THEMES.map((themeOption) => (
            <ThemeSwatchButton
              key={themeOption.id}
              onSelect={applyTheme}
              selected={activeThemeId === themeOption.id}
              theme={themeOption}
              variant="card"
            />
          ))}
        </div>
      </section>

      <section className="space-y-2.5">
        <div>
          <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.18em]">
            {t("themes.page.advancedEyebrow")}
          </p>
          <h3 className="text-app-foreground mt-1.5 text-base font-semibold">
            {t("themes.page.advancedTitle")}
          </h3>
          <p className="text-app-muted mt-1 text-xs leading-5">
            {t("themes.page.advancedDescription")}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {ADVANCED_WIZARDS_THEMES.map((themeOption) => (
            <ThemeSwatchButton
              key={themeOption.id}
              onSelect={applyTheme}
              selected={activeThemeId === themeOption.id}
              theme={themeOption}
              variant="card"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
