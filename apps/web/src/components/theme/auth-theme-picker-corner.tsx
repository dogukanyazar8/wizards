"use client";

import { ChevronDown, Globe2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  DEFAULT_WIZARDS_THEME,
  WIZARDS_THEMES,
  normalizeWizardsThemeId,
  type WizardsThemeId,
} from "@/lib/appearance";
import { type AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const AUTH_THEME_ROUTES = new Set(["/login", "/register"]);
const LANGUAGE_OPTIONS: AppLocale[] = ["tr", "en"];

function getThemeMode(themeId: WizardsThemeId) {
  return WIZARDS_THEMES.find((theme) => theme.id === themeId)?.mode ?? "light";
}

export function AuthThemePickerCorner() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!languageOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (languageMenuRef.current?.contains(target)) {
        return;
      }

      setLanguageOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [languageOpen]);

  if (!AUTH_THEME_ROUTES.has(pathname)) {
    return null;
  }

  const activeThemeId = mounted
    ? normalizeWizardsThemeId(theme ?? resolvedTheme)
    : DEFAULT_WIZARDS_THEME;
  const activeMode = getThemeMode(activeThemeId);

  return (
    <div className="absolute inset-x-4 top-4 z-30 flex justify-end sm:top-6 lg:right-8 lg:top-8">
      <div className="auth-top-controls flex flex-wrap items-center justify-end gap-3">
        <div className="auth-theme-switch inline-flex rounded-full border p-1">
          <button
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition",
              activeMode === "light"
                ? "bg-[hsl(var(--surface-card))] text-app-foreground shadow-[0_12px_28px_hsl(var(--shadow-color)/0.12)]"
                : "text-app-muted hover:text-app-foreground",
            )}
            onClick={() => setTheme("theme-light")}
            type="button"
          >
            <Sun className="h-4 w-4 text-[hsl(var(--primary))]" />
            <span>{t("auth.controls.light")}</span>
          </button>
          <button
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold transition",
              activeMode === "dark"
                ? "bg-[hsl(var(--surface-card))] text-app-foreground shadow-[0_12px_28px_hsl(var(--shadow-color)/0.12)]"
                : "text-app-muted hover:text-app-foreground",
            )}
            onClick={() => setTheme("theme-dark")}
            type="button"
          >
            <Moon className="h-4 w-4" />
            <span>{t("auth.controls.dark")}</span>
          </button>
        </div>

        <div className="relative" ref={languageMenuRef}>
          <button
            aria-expanded={languageOpen}
            className="auth-language-trigger inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.64)]"
            onClick={() => setLanguageOpen((current) => !current)}
            type="button"
          >
            <Globe2 className="h-4 w-4" />
            <span>{t(`appearance.language.${locale}Full`)}</span>
            <ChevronDown className={cn("h-4 w-4 transition", languageOpen && "rotate-180")} />
          </button>

          {languageOpen ? (
            <div className="auth-language-menu absolute right-0 mt-2 w-44 rounded-[20px] border p-1 shadow-[0_20px_50px_hsl(var(--shadow-color)/0.18)]">
              {LANGUAGE_OPTIONS.map((option) => {
                const active = locale === option;

                return (
                  <button
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-semibold transition",
                      active
                        ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                        : "text-app-muted hover:bg-[hsl(var(--surface-soft)/0.68)] hover:text-app-foreground",
                    )}
                    data-active={active ? "true" : "false"}
                    key={option}
                    onClick={() => {
                      setLocale(option);
                      setLanguageOpen(false);
                    }}
                    type="button"
                  >
                    <span>{t(`appearance.language.${option}Full`)}</span>
                    <span className="text-xs">{t(`appearance.language.${option}`)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
