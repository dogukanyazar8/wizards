"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Palette, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { ThemePicker } from "@/components/theme/theme-picker";
import { useI18n } from "@/components/providers/locale-provider";

const AUTH_THEME_ROUTES = new Set(["/login", "/register"]);

export function AuthThemePickerCorner() {
  const pathname = usePathname();
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      setMobileOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileOpen]);

  if (!AUTH_THEME_ROUTES.has(pathname)) {
    return null;
  }

  return (
    <div className="absolute inset-x-4 top-3 z-30 lg:inset-x-auto lg:right-8 lg:top-8">
      <div className="hidden items-start gap-3 sm:flex">
        <LanguageSwitcher />
        <ThemePicker variant="compact" />
      </div>

      <div className="flex items-center justify-end gap-2 sm:hidden">
        <LanguageSwitcher className="shrink-0" />
        <button
          aria-expanded={mobileOpen}
          aria-label={t("themes.page.simpleTitle")}
          className="app-overlay inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-semibold text-app-foreground shadow-[0_16px_40px_hsl(var(--shadow-color)/0.16)] backdrop-blur-xl transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          onClick={() => setMobileOpen((current) => !current)}
          ref={triggerRef}
          type="button"
        >
          <Palette className="h-4 w-4 text-[hsl(var(--primary))]" />
          <span>{t("themes.tabs.simple")}</span>
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="fixed inset-x-3 top-[4.25rem] z-40 sm:hidden"
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            ref={panelRef}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="app-overlay max-h-[min(28rem,calc(100dvh-5rem))] overflow-y-auto rounded-[28px] border p-3 shadow-[0_22px_60px_hsl(var(--shadow-color)/0.2)] backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                  <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.22em]">
                    {t("themes.page.simpleEyebrow")}
                  </p>
                  <p className="text-app-foreground mt-1 text-sm font-semibold">
                    {t("themes.page.simpleTitle")}
                  </p>
                </div>
                <button
                  aria-label={t("common.close")}
                  className="app-panel-soft flex min-h-10 min-w-10 items-center justify-center rounded-full border text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                  onClick={() => setMobileOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ThemePicker className="w-full shadow-none" variant="compact" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
