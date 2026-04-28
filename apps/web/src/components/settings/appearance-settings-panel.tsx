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
  DEFAULT_MAIN_PANEL_WIDTH,
  DEFAULT_SERVER_RAIL_WIDTH,
  MAX_CHANNEL_SIDEBAR_WIDTH,
  MAX_MAIN_PANEL_WIDTH,
  MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  MAX_SERVER_RAIL_WIDTH,
  MIN_CHANNEL_SIDEBAR_WIDTH,
  MIN_MAIN_PANEL_WIDTH,
  MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS,
  MIN_SERVER_RAIL_WIDTH,
  NOTIFICATION_LIMIT_OPTIONS,
  NOTIFICATION_LIMIT_STEP,
  NOTIFICATION_POPUP_TIMEOUT_STEP,
  SERVER_RAIL_WIDTH_STEP,
  MAIN_PANEL_WIDTH_STEP,
} from "@/lib/appearance";
import { useAppStore } from "@/lib/store";

export function AppearanceSettingsPanel() {
  const { t } = useI18n();
  const {
    channelSidebarWidth,
    mainPanelWidth,
    notificationAutoClose,
    notificationLimit,
    notificationPopupTimeoutSeconds,
    resetChannelSidebarWidth,
    resetMainPanelWidth,
    resetServerRailWidth,
    serverRailWidth,
    setChannelSidebarWidth,
    setMainPanelWidth,
    setNotificationAutoClose,
    setNotificationLimit,
    setNotificationPopupTimeoutSeconds,
    setServerRailWidth,
  } = useAppStore(
    useShallow((state) => ({
      channelSidebarWidth: state.channelSidebarWidth,
      mainPanelWidth: state.mainPanelWidth,
      notificationAutoClose: state.notificationAutoClose,
      notificationLimit: state.notificationLimit,
      notificationPopupTimeoutSeconds: state.notificationPopupTimeoutSeconds,
      resetChannelSidebarWidth: state.resetChannelSidebarWidth,
      resetMainPanelWidth: state.resetMainPanelWidth,
      resetServerRailWidth: state.resetServerRailWidth,
      serverRailWidth: state.serverRailWidth,
      setChannelSidebarWidth: state.setChannelSidebarWidth,
      setMainPanelWidth: state.setMainPanelWidth,
      setNotificationAutoClose: state.setNotificationAutoClose,
      setNotificationLimit: state.setNotificationLimit,
      setNotificationPopupTimeoutSeconds: state.setNotificationPopupTimeoutSeconds,
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
                {t("appearance.canvas.eyebrow")}
              </p>
              <h3 className="text-app-foreground mt-2 text-lg font-semibold">
                {t("appearance.canvas.title")}
              </h3>
              <p className="text-app-muted mt-1 text-sm leading-6">
                {t("appearance.canvas.description")}
              </p>
            </div>
            <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
              <SlidersHorizontal className="text-app-muted h-4 w-4" />
              <span className="text-app-foreground text-sm font-medium">
                {mainPanelWidth}px
              </span>
            </div>
          </div>

          <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5">
            <input
              aria-label="Adjust main panel width"
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
              max={MAX_MAIN_PANEL_WIDTH}
              min={MIN_MAIN_PANEL_WIDTH}
              onChange={(event) => setMainPanelWidth(Number(event.target.value))}
              step={MAIN_PANEL_WIDTH_STEP}
              type="range"
              value={mainPanelWidth}
            />
            <div className="text-app-muted mt-3 flex items-center justify-between text-xs font-medium">
              <span>{t("appearance.canvas.compact")}</span>
              <span>{t("appearance.canvas.balanced")}</span>
              <span>{t("appearance.canvas.immersive")}</span>
            </div>

            <div className="app-panel-soft mt-5 rounded-[24px] border p-4">
              <div className="mx-auto flex max-w-full justify-center">
                <div
                  className="rounded-[24px] border border-[hsl(var(--border)/0.74)] bg-[linear-gradient(160deg,hsl(var(--surface-card)/0.9),hsl(var(--surface-soft)/0.34))] p-4 shadow-[0_18px_42px_hsl(var(--shadow-color)/0.08)]"
                  style={{ width: `${Math.min(mainPanelWidth, 520)}px` }}
                >
                  <div className="h-4 w-32 rounded-full bg-[hsl(var(--surface-soft))]" />
                  <div className="mt-3 h-24 rounded-[18px] bg-[hsl(var(--surface-soft)/0.82)]" />
                  <div className="mt-3 flex gap-3">
                    <div className="h-3 flex-1 rounded-full bg-[hsl(var(--surface-soft)/0.72)]" />
                    <div className="h-3 w-24 rounded-full bg-[hsl(var(--surface-soft)/0.58)]" />
                  </div>
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

      <section className="app-panel rounded-[30px] border p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.22em]">
                {t("appearance.notifications.eyebrow")}
              </p>
              <h3 className="text-app-foreground mt-2 text-lg font-semibold">
                {t("appearance.notifications.title")}
              </h3>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <label className="text-app-foreground text-sm font-medium">
                  {t("appearance.notifications.count")}
                </label>
                <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
                  <span className="text-app-foreground text-sm font-medium">
                    {notificationLimit}
                  </span>
                </div>
              </div>
              <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5">
                <input
                  aria-label="Adjust notification count"
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
                  max={Math.max(...NOTIFICATION_LIMIT_OPTIONS)}
                  min={Math.min(...NOTIFICATION_LIMIT_OPTIONS)}
                  onChange={(event) => setNotificationLimit(Number(event.target.value))}
                  step={NOTIFICATION_LIMIT_STEP}
                  type="range"
                  value={notificationLimit}
                />
                <div className="text-app-muted mt-3 flex items-center justify-between text-xs font-medium">
                  <span>{Math.min(...NOTIFICATION_LIMIT_OPTIONS)}</span>
                  <span>{Math.max(...NOTIFICATION_LIMIT_OPTIONS)}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="text-app-foreground text-sm font-medium">
                  {t("appearance.notifications.duration")}
                </label>
                <div className="app-panel-soft inline-flex items-center gap-2 rounded-2xl border px-3 py-2">
                  <span className="text-app-foreground text-sm font-medium">
                    {notificationPopupTimeoutSeconds}s
                  </span>
                </div>
              </div>
              <div className="rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.24)] p-5">
                <input
                  aria-label="Adjust notification auto-close delay"
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.9)] accent-[hsl(var(--primary))]"
                  max={MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS}
                  min={MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS}
                  onChange={(event) =>
                    setNotificationPopupTimeoutSeconds(Number(event.target.value))
                  }
                  step={NOTIFICATION_POPUP_TIMEOUT_STEP}
                  type="range"
                  value={notificationPopupTimeoutSeconds}
                />
                <div className="text-app-muted mt-3 flex items-center justify-between text-xs font-medium">
                  <span>{MIN_NOTIFICATION_POPUP_TIMEOUT_SECONDS}s</span>
                  <span>{MAX_NOTIFICATION_POPUP_TIMEOUT_SECONDS}s</span>
                </div>
                <p className="text-app-muted mt-4 text-xs leading-5">
                  {t("appearance.notifications.durationDesc")}
                </p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificationAutoClose}
                  onChange={(event) => setNotificationAutoClose(event.target.checked)}
                  className="h-4 w-4 rounded border-[hsl(var(--border))] cursor-pointer"
                />
                <div>
                  <p className="text-app-foreground text-sm font-medium">
                    {t("appearance.notifications.autoClose")}
                  </p>
                  <p className="text-app-muted text-xs">
                    {t("appearance.notifications.autoCloseDesc")}
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={
            serverRailWidth === DEFAULT_SERVER_RAIL_WIDTH &&
            channelSidebarWidth === DEFAULT_CHANNEL_SIDEBAR_WIDTH &&
            mainPanelWidth === DEFAULT_MAIN_PANEL_WIDTH
          }
          onClick={() => {
            resetServerRailWidth();
            resetChannelSidebarWidth();
            resetMainPanelWidth();
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
        <Button
          disabled={mainPanelWidth === DEFAULT_MAIN_PANEL_WIDTH}
          onClick={resetMainPanelWidth}
          type="button"
          variant="outline"
        >
          {t("appearance.resetCanvas")}
        </Button>
      </div>
    </div>
  );
}
