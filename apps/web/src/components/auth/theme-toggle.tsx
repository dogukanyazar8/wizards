"use client";

import { ChevronDown, Globe2, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/providers/locale-provider";
import { useLoginTheme } from "@/hooks/use-login-theme";
import { type AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const LANGUAGE_OPTIONS: AppLocale[] = ["tr", "en"];

export function ThemeToggle() {
  const { setTheme, theme } = useLoginTheme();
  const { locale, setLocale, t } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!languageOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setLanguageOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [languageOpen]);

  return (
    <div className="modern-login-topbar">
      <div className="modern-theme-switch" aria-label={t("common.appearance")}>
        <button
          className={cn(theme === "light" && "is-active")}
          onClick={() => setTheme("light")}
          type="button"
        >
          <Sun className="h-4 w-4" />
          {t("auth.controls.light")}
        </button>
        <button
          className={cn(theme === "dark" && "is-active")}
          onClick={() => setTheme("dark")}
          type="button"
        >
          <Moon className="h-4 w-4" />
          {t("auth.controls.dark")}
        </button>
      </div>

      <div className="modern-language-wrap" ref={menuRef}>
        <button
          aria-expanded={languageOpen}
          className="modern-language-button"
          onClick={() => setLanguageOpen((current) => !current)}
          type="button"
        >
          <Globe2 className="h-4 w-4" />
          {t(`appearance.language.${locale}Full`)}
          <ChevronDown className={cn("h-4 w-4", languageOpen && "rotate-180")} />
        </button>
        {languageOpen ? (
          <div className="modern-language-menu">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                className={cn(locale === option && "is-active")}
                key={option}
                onClick={() => {
                  setLocale(option);
                  setLanguageOpen(false);
                }}
                type="button"
              >
                <span>{t(`appearance.language.${option}Full`)}</span>
                <span>{t(`appearance.language.${option}`)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
