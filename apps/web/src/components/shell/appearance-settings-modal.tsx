"use client";

import { SlidersHorizontal } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@wizards/ui";
import { Modal } from "@/components/ui/modal";
import {
  DEFAULT_SERVER_RAIL_WIDTH,
  MAX_SERVER_RAIL_WIDTH,
  MIN_SERVER_RAIL_WIDTH,
  SERVER_RAIL_WIDTH_STEP,
  WIZARDS_THEMES,
  type WizardsThemeId,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

export function AppearanceSettingsModal() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const {
    appearanceModalOpen,
    closeAppearanceModal,
    resetServerRailWidth,
    serverRailWidth,
    setServerRailWidth,
  } = useAppStore(
    useShallow((state) => ({
      appearanceModalOpen: state.appearanceModalOpen,
      closeAppearanceModal: state.closeAppearanceModal,
      resetServerRailWidth: state.resetServerRailWidth,
      serverRailWidth: state.serverRailWidth,
      setServerRailWidth: state.setServerRailWidth,
    })),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = (mounted ? theme ?? resolvedTheme : "theme-graphite") as WizardsThemeId;

  return (
    <Modal
      className="max-w-3xl"
      description="Tailor the overall look of Wizards with softer lighting, brighter palettes, or a more expressive canvas."
      onClose={closeAppearanceModal}
      open={appearanceModalOpen}
      title="Appearance"
    >
      <div className="space-y-8">
        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-app-soft">
              Theme Presets
            </p>
            <h3 className="mt-2 text-lg font-semibold text-app-foreground">
              Pick the atmosphere that feels right
            </h3>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {WIZARDS_THEMES.map((themeOption) => {
              const selected = activeTheme === themeOption.id;

              return (
                <button
                  className={cn(
                    "rounded-[24px] border p-4 text-left transition duration-200",
                    "app-panel hover:-translate-y-0.5 hover:shadow-lg",
                    selected && "ring-2 ring-[hsl(var(--ring)/0.55)]",
                  )}
                  key={themeOption.id}
                  onClick={() => setTheme(themeOption.id)}
                  type="button"
                >
                  <div className="mb-4 flex gap-2">
                    {themeOption.preview.map((color) => (
                      <span
                        className="h-10 flex-1 rounded-2xl border border-black/5"
                        key={color}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-app-foreground">{themeOption.label}</p>
                  <p className="mt-1 text-xs text-app-muted">{themeOption.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-app-soft">
                Server Rail
              </p>
              <h3 className="mt-2 text-lg font-semibold text-app-foreground">
                Widen the server column to reduce crowding
              </h3>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border app-panel px-3 py-2">
              <SlidersHorizontal className="h-4 w-4 text-app-muted" />
              <span className="text-sm font-medium text-app-foreground">{serverRailWidth}px</span>
            </div>
          </div>

          <div className="rounded-[28px] border app-panel p-5">
            <input
              aria-label="Adjust server rail width"
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
              max={MAX_SERVER_RAIL_WIDTH}
              min={MIN_SERVER_RAIL_WIDTH}
              onChange={(event) => setServerRailWidth(Number(event.target.value))}
              step={SERVER_RAIL_WIDTH_STEP}
              type="range"
              value={serverRailWidth}
            />
            <div className="mt-3 flex items-center justify-between text-xs font-medium text-app-muted">
              <span>Compact</span>
              <span>Balanced</span>
              <span>Spacious</span>
            </div>

            <div className="mt-5 rounded-[24px] border app-panel-soft p-4">
              <div className="flex items-center gap-3">
                <div
                  className="shrink-0 rounded-[22px] border app-panel-soft p-3"
                  style={{ width: `${Math.max(72, serverRailWidth)}px` }}
                >
                  <div className="mx-auto h-10 w-10 rounded-[16px] bg-[hsl(var(--primary)/0.18)]" />
                </div>
                <div className="min-w-0 flex-1 rounded-[22px] border app-panel p-4">
                  <div className="h-4 w-32 rounded-full bg-[hsl(var(--surface-soft))]" />
                  <div className="mt-3 h-3 w-20 rounded-full bg-[hsl(var(--surface-soft)/0.8)]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button
            disabled={serverRailWidth === DEFAULT_SERVER_RAIL_WIDTH}
            onClick={resetServerRailWidth}
            type="button"
            variant="outline"
          >
            Reset Width
          </Button>
          <Button onClick={closeAppearanceModal} type="button">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
