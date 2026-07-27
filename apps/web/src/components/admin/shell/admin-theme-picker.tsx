"use client";

import { Check, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore, useTransition } from "react";
import { updateThemePreferenceAction } from "@/lib/appearance/actions";
import {
  DEFAULT_WIZARDS_THEME,
  WIZARDS_THEME_MAP,
  applyWizardsThemeToDocument,
  getThemePreviewBackground,
  normalizeWizardsThemeId,
  type WizardsThemeId,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

export const ADMIN_THEME_IDS = [
  "theme-light",
  "theme-lavender",
  "theme-dark",
  "theme-ash",
  "theme-onyx",
  "theme-ocean-dark",
] as const satisfies readonly WizardsThemeId[];

const subscribeToHydration = () => () => {};

export function AdminThemePicker() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const activeTheme = mounted
    ? normalizeWizardsThemeId(theme ?? resolvedTheme)
    : DEFAULT_WIZARDS_THEME;

  function selectTheme(themeId: WizardsThemeId) {
    const nextTheme = applyWizardsThemeToDocument(themeId);

    setTheme(nextTheme);
    startTransition(async () => {
      await updateThemePreferenceAction(nextTheme);
    });
  }

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Tema seç"
        className="app-panel-soft text-app-muted flex h-9 w-9 items-center justify-center rounded-[10px] border hover:text-app-foreground"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Palette size={16} />
      </button>
      {open ? (
        <div
          className="app-overlay absolute right-0 top-11 z-20 grid w-[204px] grid-cols-3 gap-2 rounded-[14px] border p-3 shadow-[0_16px_38px_hsl(var(--shadow-color)/0.16)]"
          role="menu"
        >
          {ADMIN_THEME_IDS.map((themeId) => {
            const themeOption = WIZARDS_THEME_MAP[themeId];
            const selected = activeTheme === themeId;

            return (
              <button
                aria-label={themeOption.label}
                aria-checked={selected}
                className={cn(
                  "relative flex h-12 items-center justify-center rounded-[10px] border transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  selected
                    ? "border-[hsl(var(--primary))] shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]"
                    : "border-[hsl(var(--border)/0.75)] hover:border-[hsl(var(--primary)/0.45)]",
                )}
                disabled={isPending}
                key={themeId}
                onClick={() => selectTheme(themeId)}
                role="menuitemradio"
                style={{ background: getThemePreviewBackground(themeOption.preview) }}
                title={themeOption.label}
                type="button"
              >
                {selected ? (
                  <span className="rounded-full bg-[hsl(var(--backdrop)/0.32)] p-1 text-app-foreground">
                    <Check size={13} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
