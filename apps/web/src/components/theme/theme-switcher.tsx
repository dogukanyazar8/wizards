"use client";

import { Check, ChevronDown, Palette, SlidersHorizontal } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  WIZARDS_THEMES,
  type WizardsThemeId,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

const FALLBACK_THEME = WIZARDS_THEMES[0]!;

type ThemeSwitcherProps = {
  className?: string;
  onOpenAppearanceSettings?: () => void;
  placement?: "floating" | "inline";
};

function previewGradient(colors: [string, string, string]) {
  return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 55%, ${colors[2]} 100%)`;
}

export function ThemeSwitcher({
  className,
  onOpenAppearanceSettings,
  placement = "inline",
}: ThemeSwitcherProps) {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const activeThemeId = ((mounted ? theme ?? resolvedTheme : "theme-graphite") ??
    "theme-graphite") as WizardsThemeId;
  const activeTheme =
    WIZARDS_THEMES.find((option) => option.id === activeThemeId) ??
    FALLBACK_THEME;

  const panelPlacementClass =
    placement === "floating" ? "absolute right-0 top-full mt-3" : "absolute right-0 top-full mt-3";

  const triggerPreview = useMemo(
    () => previewGradient(activeTheme.preview),
    [activeTheme.preview],
  );

  return (
    <div
      className={cn(
        "relative",
        placement === "floating" && "z-30",
        className,
      )}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "group app-panel-soft flex items-center gap-3 rounded-[22px] border px-3 py-2.5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition duration-200",
          "hover:-translate-y-0.5 hover:border-[hsl(var(--border)/0.98)] hover:bg-[hsl(var(--surface-card)/0.9)]",
          open && "border-[hsl(var(--ring)/0.5)] bg-[hsl(var(--surface-card)/0.92)]",
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-white/10 shadow-inner shadow-black/10"
          style={{ background: triggerPreview }}
        >
          <Palette className="h-4 w-4 text-white drop-shadow-sm" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-app-soft block text-[11px] font-semibold uppercase tracking-[0.24em]">
            Theme
          </span>
          <span className="text-app-foreground mt-1 block truncate text-sm font-semibold">
            {activeTheme.label}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "text-app-muted h-4 w-4 shrink-0 transition duration-200",
            open && "rotate-180 text-[hsl(var(--foreground))]",
          )}
        />
      </button>

      {open ? (
        <div
          className={cn(
            "app-overlay z-40 w-[min(92vw,360px)] rounded-[30px] border p-3 shadow-[0_32px_80px_rgba(2,8,23,0.34)] backdrop-blur-2xl",
            panelPlacementClass,
          )}
        >
          <div className="rounded-[24px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-card)/0.65)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.24em]">
                  Visual Style
                </p>
                <h3 className="text-app-foreground mt-2 text-base font-semibold">
                  Pick a workspace mood
                </h3>
                <p className="text-app-muted mt-1 text-xs leading-6">
                  Switch instantly between brighter, darker, or more expressive palettes.
                </p>
              </div>
              <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.6)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-app-soft">
                {WIZARDS_THEMES.length} Themes
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {WIZARDS_THEMES.map((option) => {
                const selected = option.id === activeThemeId;

                return (
                  <button
                    className={cn(
                      "group flex items-center gap-3 rounded-[22px] border px-3 py-3 text-left transition duration-200",
                      "hover:-translate-y-0.5 hover:border-[hsl(var(--border)/0.95)] hover:bg-[hsl(var(--surface-soft)/0.48)]",
                      selected
                        ? "border-[hsl(var(--ring)/0.55)] bg-[hsl(var(--surface-soft)/0.58)] shadow-[0_18px_36px_rgba(15,23,42,0.18)]"
                        : "border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-panel)/0.45)]",
                    )}
                    key={option.id}
                    onClick={() => {
                      setTheme(option.id);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span
                      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border border-white/10 shadow-inner shadow-black/10"
                      style={{ background: previewGradient(option.preview) }}
                    >
                      {selected ? (
                        <span className="absolute -right-1.5 -top-1.5 rounded-full border border-white/10 bg-[hsl(var(--foreground))] p-1 text-[hsl(var(--background))] shadow-lg shadow-black/20">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-app-foreground block text-sm font-semibold">
                        {option.label}
                      </span>
                      <span className="text-app-muted mt-1 block text-xs">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {onOpenAppearanceSettings ? (
              <button
                className="app-panel-soft text-app-foreground mt-4 flex w-full items-center justify-between rounded-[22px] border px-3 py-3 text-sm font-semibold transition hover:border-[hsl(var(--border)/0.95)] hover:bg-[hsl(var(--surface-soft)/0.68)]"
                onClick={() => {
                  onOpenAppearanceSettings();
                  setOpen(false);
                }}
                type="button"
              >
                <span>
                  Layout controls
                  <span className="text-app-muted ml-2 text-xs font-medium">
                    Resize rails and sidebars
                  </span>
                </span>
                <SlidersHorizontal className="text-app-muted h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
