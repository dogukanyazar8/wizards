"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, RefreshCw, Sparkles, X } from "lucide-react";
import {
  WHISPR_BUILD_ID,
  WHISPR_BUILD_TIME,
  WHISPR_RELEASE_CHANNEL,
  WHISPR_APP_VERSION,
  type WhisprVersionPayload,
} from "@/lib/app-version";
import { useI18n } from "@/components/providers/locale-provider";

import { useAppUpdate } from "@/hooks/use-app-update";
import { useVoiceStore } from "@/store/voice-store";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
const DISMISSED_UPDATE_STORAGE_KEY = "whispr.dismissedUpdateBuildId";

const subscribeRuntime = () => () => {};
const getUpdateSurface = () => (isWhisprDesktopRuntime() ? "desktop" : "web");
// Do not render a web banner during hydration before the native marker is known.
const getServerUpdateSurface = () => null;

function formatBuildId(buildId: string) {
  return buildId.trim() || "unknown";
}

export function isUpdateDismissed(
  latestBuildId: string | undefined,
  dismissedBuildId: string | null,
) {
  return Boolean(latestBuildId && latestBuildId === dismissedBuildId);
}

function isTranslationKey(value: string) {
  return /^[a-z][a-z0-9]*(?:\.[a-zA-Z0-9_-]+)+$/.test(value);
}

function translateUpdateText(
  t: (key: string, values?: Record<string, number | string>) => string,
  key: string,
  fallback: string | undefined,
) {
  const translated = t(key);
  if (translated !== key) {
    return translated;
  }

  return isTranslationKey(key) ? (fallback ?? key) : key;
}

export function AppUpdateNotifier() {
  const surface = useSyncExternalStore(subscribeRuntime, getUpdateSurface, getServerUpdateSurface);
  // Native update state is still shared with Desktop Control and the title bar.
  useAppUpdate(true, "desktop");
  return surface === "web" ? <WebAppUpdateNotifier /> : null;
}

function WebAppUpdateNotifier() {
  const { t } = useI18n();
  const update = useAppUpdate(true, "web");
  const latestVersion = update.query.data?.webVersion;
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissedBuildId, setDismissedBuildId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(DISMISSED_UPDATE_STORAGE_KEY),
  );

  const currentVersion = useMemo<WhisprVersionPayload>(
    () => ({
      appName: "Whispr",
      buildId: WHISPR_BUILD_ID,
      buildTime: WHISPR_BUILD_TIME,
      releaseChannel: WHISPR_RELEASE_CHANNEL,
      version: WHISPR_APP_VERSION,
      notes: [],
    }),
    [],
  );

  const hasUpdate =
    Boolean(latestVersion?.buildId) && latestVersion?.buildId !== currentVersion.buildId;
  const isDismissed = isUpdateDismissed(latestVersion?.buildId, dismissedBuildId);

  if (!hasUpdate || !latestVersion || isDismissed) {
    return null;
  }

  const dismissUpdate = () => {
    window.localStorage.setItem(DISMISSED_UPDATE_STORAGE_KEY, latestVersion.buildId);
    setDismissedBuildId(latestVersion.buildId);
  };

  const reloadApp = () => {
    if (
      useVoiceStore.getState().activeChannelId !== null ||
      useVoiceStore.getState().activeConversationId !== null
    )
      return;
    window.location.reload();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <section className="pointer-events-auto w-full max-w-4xl overflow-hidden rounded-[28px] border border-[hsl(var(--border)/0.74)] bg-[hsl(var(--background)/0.88)] shadow-[0_24px_80px_hsl(var(--foreground)/0.14)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/0.22)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--accent)/0.14))] text-[hsl(var(--primary))] shadow-[0_12px_34px_hsl(var(--primary)/0.18)]">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-app-muted">
                {t("app.update.badge")}
              </p>
              <h2 className="mt-1 text-base font-black tracking-[-0.02em] text-app-foreground sm:text-lg">
                {t("app.update.title")}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-app-muted">
                {t("app.update.description", {
                  current: currentVersion.version,
                  latest: latestVersion.version,
                })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface-soft)/0.64)] px-3 text-sm font-bold text-app-foreground transition hover:border-[hsl(var(--primary)/0.45)] hover:bg-[hsl(var(--primary)/0.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() => setIsExpanded((value) => !value)}
              type="button"
            >
              {t("app.update.whatsNew")}
              <ChevronDown
                className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-[hsl(var(--primary)/0.42)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.98),hsl(var(--surface-soft)/0.9))] px-3.5 text-sm font-black text-app-foreground shadow-[0_16px_38px_hsl(var(--primary)/0.18),inset_0_1px_0_hsl(var(--background)/0.42)] transition hover:translate-y-[-1px] hover:border-[hsl(var(--primary)/0.62)] hover:bg-[linear-gradient(135deg,hsl(var(--primary)/0.14),hsl(var(--surface-card)/0.96))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              disabled={update.voiceActive}
              title={update.voiceActive ? t("settings.update.endCall") : undefined}
              onClick={reloadApp}
              type="button"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--primary))]">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span>{t("app.update.refresh")}</span>
            </button>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-transparent text-app-muted transition hover:border-[hsl(var(--border)/0.78)] hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={dismissUpdate}
              type="button"
              aria-label={t("app.update.later")}
              title={t("app.update.later")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {isExpanded ? (
          <div className="border-t border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.38)] px-4 py-4 sm:px-5">
            <div className="mb-4 grid gap-2 text-xs font-bold text-app-muted sm:grid-cols-2">
              <span className="flex min-w-0 flex-wrap items-start gap-2 rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--background)/0.64)] px-3 py-2">
                <span className="shrink-0 py-1">
                  {t("app.update.currentBuild", { build: "" }).trim()}
                </span>
                <code
                  className="min-w-0 flex-1 whitespace-normal break-all rounded-xl border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.72)] px-2 py-1 font-mono text-[11px] font-black leading-5 text-app-foreground"
                  title={currentVersion.buildId}
                >
                  {formatBuildId(currentVersion.buildId)}
                </code>
              </span>
              <span className="flex min-w-0 flex-wrap items-start gap-2 rounded-2xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.08)] px-3 py-2 text-[hsl(var(--primary))]">
                <span className="shrink-0 py-1">
                  {t("app.update.latestBuild", { build: "" }).trim()}
                </span>
                <code
                  className="min-w-0 flex-1 whitespace-normal break-all rounded-xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--background)/0.68)] px-2 py-1 font-mono text-[11px] font-black leading-5 text-app-foreground"
                  title={latestVersion.buildId}
                >
                  {formatBuildId(latestVersion.buildId)}
                </code>
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {latestVersion.notes.map((note) => {
                const category = translateUpdateText(t, note.categoryKey, note.fallbackCategory);
                const title = translateUpdateText(t, note.titleKey, note.fallbackTitle);
                const description = translateUpdateText(
                  t,
                  note.descriptionKey,
                  note.fallbackDescription,
                );

                return (
                  <article
                    className="rounded-[22px] border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--background)/0.72)] p-4 shadow-[0_12px_32px_hsl(var(--foreground)/0.06)]"
                    key={note.id}
                  >
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-[hsl(var(--primary))]">
                      {category}
                    </p>
                    <h3 className="mt-2 text-sm font-black text-app-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-app-muted">{description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
