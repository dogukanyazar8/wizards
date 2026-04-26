"use client";

import { SlidersHorizontal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@wizards/ui";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { useI18n } from "@/components/providers/locale-provider";
import { ThemePicker } from "@/components/theme/theme-picker";
import {
  CHANNEL_SIDEBAR_WIDTH_STEP,
  DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  DEFAULT_SERVER_RAIL_WIDTH,
  MAX_CHANNEL_SIDEBAR_WIDTH,
  MAX_SERVER_RAIL_WIDTH,
  MIN_CHANNEL_SIDEBAR_WIDTH,
  MIN_SERVER_RAIL_WIDTH,
  SERVER_RAIL_WIDTH_STEP,
} from "@/lib/appearance";
import { useAppStore } from "@/lib/store";

export function AppearanceSettingsPanel() {
  const { t } = useI18n();
  const {
    channelSidebarWidth,
    resetChannelSidebarWidth,
    resetServerRailWidth,
    serverRailWidth,
    setChannelSidebarWidth,
    setServerRailWidth,
  } = useAppStore(
    useShallow((state) => ({
      channelSidebarWidth: state.channelSidebarWidth,
      resetChannelSidebarWidth: state.resetChannelSidebarWidth,
      resetServerRailWidth: state.resetServerRailWidth,
      serverRailWidth: state.serverRailWidth,
      setChannelSidebarWidth: state.setChannelSidebarWidth,
      setServerRailWidth: state.setServerRailWidth,
    })),
  );

  return (
    <div className="space-y-8">
      <section className="app-panel rounded-[30px] border p-6">
        <div className="space-y-4">
          <div>
            <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
              {t("appearance.language.eyebrow")}
            </p>
            <h3 className="text-app-foreground mt-2 text-lg font-semibold">
              {t("appearance.language.title")}
            </h3>
            <p className="text-app-muted mt-1 text-sm leading-6">
              {t("appearance.language.description")}
            </p>
          </div>
          <LanguageSwitcher persistSelection showMeta variant="panel" />
        </div>
      </section>

      <div className="app-panel rounded-[30px] border p-6">
        <ThemePicker persistSelection />
      </div>

      <section className="app-panel rounded-[30px] border p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
                {t("appearance.serverRail.eyebrow")}
              </p>
              <h3 className="text-app-foreground mt-2 text-lg font-semibold">
                {t("appearance.serverRail.title")}
              </h3>
            </div>
            <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
              <SlidersHorizontal className="text-app-muted h-4 w-4" />
              <span className="text-app-foreground text-sm font-medium">
                {serverRailWidth}px
              </span>
            </div>
          </div>

          <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5">
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
            <div className="text-app-muted mt-3 flex items-center justify-between text-xs font-medium">
              <span>{t("appearance.serverRail.compact")}</span>
              <span>{t("appearance.serverRail.balanced")}</span>
              <span>{t("appearance.serverRail.spacious")}</span>
            </div>

            <div className="app-panel-soft mt-5 rounded-[24px] border p-4">
              <div className="flex items-center gap-3">
                <div
                  className="app-panel-soft shrink-0 rounded-[22px] border p-3"
                  style={{ width: `${Math.max(72, serverRailWidth)}px` }}
                >
                  <div className="mx-auto h-10 w-10 rounded-[16px] bg-[hsl(var(--primary)/0.18)]" />
                </div>
                <div className="app-panel min-w-0 flex-1 rounded-[22px] border p-4">
                  <div className="h-4 w-32 rounded-full bg-[hsl(var(--surface-soft))]" />
                  <div className="mt-3 h-3 w-20 rounded-full bg-[hsl(var(--surface-soft)/0.8)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="app-panel rounded-[30px] border p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
                {t("appearance.sidebar.eyebrow")}
              </p>
              <h3 className="text-app-foreground mt-2 text-lg font-semibold">
                {t("appearance.sidebar.title")}
              </h3>
            </div>
            <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
              <SlidersHorizontal className="text-app-muted h-4 w-4" />
              <span className="text-app-foreground text-sm font-medium">
                {channelSidebarWidth}px
              </span>
            </div>
          </div>

          <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5">
            <input
              aria-label="Adjust channel sidebar width"
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
              max={MAX_CHANNEL_SIDEBAR_WIDTH}
              min={MIN_CHANNEL_SIDEBAR_WIDTH}
              onChange={(event) =>
                setChannelSidebarWidth(Number(event.target.value))
              }
              step={CHANNEL_SIDEBAR_WIDTH_STEP}
              type="range"
              value={channelSidebarWidth}
            />
            <div className="text-app-muted mt-3 flex items-center justify-between text-xs font-medium">
              <span>{t("appearance.sidebar.compact")}</span>
              <span>{t("appearance.sidebar.readable")}</span>
              <span>{t("appearance.sidebar.studio")}</span>
            </div>

            <div className="app-panel-soft mt-5 rounded-[24px] border p-4">
              <div className="flex items-center gap-3">
                <div
                  className="app-panel-soft shrink-0 rounded-[22px] border p-3"
                  style={{ width: `${Math.max(72, serverRailWidth)}px` }}
                >
                  <div className="mx-auto h-10 w-10 rounded-[16px] bg-[hsl(var(--primary)/0.18)]" />
                </div>
                <div
                  className="app-panel shrink-0 rounded-[24px] border p-4"
                  style={{ width: `${channelSidebarWidth}px` }}
                >
                  <div className="h-4 w-36 rounded-full bg-[hsl(var(--surface-soft))]" />
                  <div className="mt-3 h-3 w-44 rounded-full bg-[hsl(var(--surface-soft)/0.8)]" />
                  <div className="mt-3 h-3 w-32 rounded-full bg-[hsl(var(--surface-soft)/0.72)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={
            serverRailWidth === DEFAULT_SERVER_RAIL_WIDTH &&
            channelSidebarWidth === DEFAULT_CHANNEL_SIDEBAR_WIDTH
          }
          onClick={() => {
            resetServerRailWidth();
            resetChannelSidebarWidth();
          }}
          type="button"
          variant="outline"
        >
          {t("appearance.resetLayout")}
        </Button>
        <Button
          disabled={serverRailWidth === DEFAULT_SERVER_RAIL_WIDTH}
          onClick={resetServerRailWidth}
          type="button"
          variant="outline"
        >
          {t("appearance.resetServerRail")}
        </Button>
        <Button
          disabled={channelSidebarWidth === DEFAULT_CHANNEL_SIDEBAR_WIDTH}
          onClick={resetChannelSidebarWidth}
          type="button"
          variant="outline"
        >
          {t("appearance.resetSidebar")}
        </Button>
      </div>
    </div>
  );
}
