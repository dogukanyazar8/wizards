"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { useHydrated } from "@/hooks/use-hydrated";
import { applyAuthTheme, resolveAuthTheme, type AuthThemeMode } from "@/lib/auth/auth-theme";
import { type AppLocale } from "@/lib/locale";

/**
 * SPEC-GIRIS-KAYIT §3.4 — dil menüsü ve iki segmentli tema anahtarı.
 *
 * Tema seçimi **yalnız auth yüzeyini** çevirir (paket kararı K6); kullanıcının global tema
 * tercihine dokunulmaz. Dil seçimi mevcut `LocaleProvider` üstünden gider.
 *
 * Erişilebilirlik (SPEC §11): dil tetikleyici `aria-haspopup="menu"` + `aria-expanded`, menü
 * satırları `role="menuitemradio"`; tema anahtarı `role="radiogroup"`, segmentler `role="radio"`.
 * Ok tuşları, `Home`/`End` ve `Esc` klavyeyle gezinmeyi tamamlar.
 */

const LANGUAGE_OPTIONS: AppLocale[] = ["tr", "en"];

export function ThemeLanguageControls() {
  const { locale, setLocale, t } = useI18n();
  const hydrated = useHydrated();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedThemeMode, setSelectedThemeMode] = useState<AuthThemeMode>(resolveAuthTheme);
  const themeMode = hydrated ? selectedThemeMode : "light";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const selectTheme = useCallback((mode: AuthThemeMode) => {
    setSelectedThemeMode(mode);
    applyAuthTheme(mode);
  }, []);

  const handleSegmentKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        selectTheme("light");
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        selectTheme("dark");
      }
    },
    [selectTheme],
  );

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']") ?? [],
    );

    if (rows.length === 0) {
      return;
    }

    const currentIndex = rows.findIndex((row) => row === document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      rows[(currentIndex + 1 + rows.length) % rows.length]?.focus();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      rows[(currentIndex - 1 + rows.length) % rows.length]?.focus();
    }

    if (event.key === "Home") {
      event.preventDefault();
      rows[0]?.focus();
    }

    if (event.key === "End") {
      event.preventDefault();
      rows[rows.length - 1]?.focus();
    }
  }, []);

  return (
    <div className="auth-controls" ref={containerRef}>
      <div className="relative">
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={t("auth.states.group.languageSelector")}
          className="auth-lang-trigger"
          onClick={() => setMenuOpen((open) => !open)}
          ref={triggerRef}
          type="button"
        >
          <span>{locale.toUpperCase()}</span>
          <span aria-hidden="true" className="auth-lang-chevron">
            {menuOpen ? "▴" : "▾"}
          </span>
        </button>

        {menuOpen ? (
          <div
            aria-label={t("auth.states.group.languageSelector")}
            className="auth-menu"
            onKeyDown={handleMenuKeyDown}
            ref={menuRef}
            role="menu"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                aria-checked={option === locale}
                className="auth-menu-row"
                key={option}
                onClick={() => {
                  setLocale(option);
                  setMenuOpen(false);
                  triggerRef.current?.focus();
                }}
                role="menuitemradio"
                type="button"
              >
                <span>{t(`appearance.language.${option}`)}</span>
                {option === locale ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        aria-label={t("auth.states.group.themeSelector")}
        className="auth-theme-switch"
        role="radiogroup"
      >
        <button
          aria-checked={themeMode === "light"}
          aria-label={t("auth.ui.light")}
          className="auth-theme-segment"
          onClick={() => selectTheme("light")}
          onKeyDown={handleSegmentKeyDown}
          role="radio"
          type="button"
        >
          <span aria-hidden="true">☀</span>
        </button>
        <button
          aria-checked={themeMode === "dark"}
          aria-label={t("auth.ui.dark")}
          className="auth-theme-segment"
          onClick={() => selectTheme("dark")}
          onKeyDown={handleSegmentKeyDown}
          role="radio"
          type="button"
        >
          <span aria-hidden="true">☾</span>
        </button>
      </div>
    </div>
  );
}
