"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  canUseDesktopNativeUpdater,
  checkDesktopNativeUpdate,
  downloadInstallAndRelaunchDesktopUpdate,
  getDesktopNativeUpdateInfo,
  type DesktopNativeUpdateDownloadState,
  type DesktopNativeUpdateInfo,
  type DesktopNativeUpdateStatus,
} from "@/lib/desktop/updater";

const DESKTOP_UPDATE_RECHECK_MS = 6 * 60 * 60 * 1000;
const DISMISSED_DESKTOP_UPDATE_STORAGE_KEY = "whispr.dismissedDesktopUpdateVersion";

type NativeUpdate = Awaited<ReturnType<typeof checkDesktopNativeUpdate>>;

function formatDownloadProgress(state: DesktopNativeUpdateDownloadState | null) {
  if (!state?.totalBytes) {
    return null;
  }

  return Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100));
}

function getDismissedDesktopUpdateVersion() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(DISMISSED_DESKTOP_UPDATE_STORAGE_KEY);
}

function dismissDesktopUpdateVersion(version: string) {
  window.localStorage.setItem(DISMISSED_DESKTOP_UPDATE_STORAGE_KEY, version);
}

export function DesktopNativeUpdateNotifier() {
  const { t } = useI18n();
  const [downloadState, setDownloadState] = useState<DesktopNativeUpdateDownloadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DesktopNativeUpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<DesktopNativeUpdateInfo | null>(null);
  const updateRef = useRef<NativeUpdate>(null);

  const canUseUpdater = canUseDesktopNativeUpdater();

  const checkForUpdate = useCallback(async () => {
    if (!canUseDesktopNativeUpdater()) {
      setStatus("unavailable");
      return;
    }

    setStatus("checking");
    setError(null);

    try {
      const update = await checkDesktopNativeUpdate();
      updateRef.current = update;

      if (!update) {
        setUpdateInfo(null);
        setStatus("idle");
        return;
      }

      const nextInfo = getDesktopNativeUpdateInfo(update);

      if (getDismissedDesktopUpdateVersion() === nextInfo.version) {
        setStatus("idle");
        return;
      }

      setUpdateInfo(nextInfo);
      setStatus("ready");
    } catch {
      setStatus("error");
      setError(t("desktop.update.error"));
    }
  }, [t]);

  useEffect(() => {
    if (!canUseUpdater) {
      return;
    }

    void checkForUpdate();

    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, DESKTOP_UPDATE_RECHECK_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canUseUpdater, checkForUpdate]);

  const progress = useMemo(() => formatDownloadProgress(downloadState), [downloadState]);

  if (!canUseUpdater || !updateInfo || status === "idle" || status === "checking") {
    return null;
  }

  const dismiss = () => {
    dismissDesktopUpdateVersion(updateInfo.version);
    setUpdateInfo(null);
    setStatus("idle");
  };

  const installUpdate = async () => {
    if (!updateRef.current) {
      return;
    }

    setStatus("downloading");
    setError(null);

    try {
      await downloadInstallAndRelaunchDesktopUpdate(updateRef.current, (state) => {
        setDownloadState(state);
      });
      setStatus("restarting");
    } catch {
      setStatus("error");
      setError(t("desktop.update.installError"));
    }
  };

  const isBusy = status === "downloading" || status === "installing" || status === "restarting";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[130] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <section className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-[24px] border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--background)/0.9)] shadow-[0_24px_70px_hsl(var(--primary)/0.16)] backdrop-blur-2xl">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.24em] text-[hsl(var(--primary))]">
                {t("desktop.update.badge")}
              </p>
              <h2 className="mt-1 text-sm font-black text-app-foreground sm:text-base">
                {t("desktop.update.title")}
              </h2>
              <p className="mt-1 text-xs leading-5 text-app-muted">
                {t("desktop.update.description", {
                  current: updateInfo.currentVersion,
                  latest: updateInfo.version,
                  ring: updateInfo.releaseRing,
                })}
              </p>
              {error ? <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p> : null}
              {progress !== null ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--surface-soft))]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--accent)))] transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.1)] px-3 text-xs font-black text-[hsl(var(--primary))] transition hover:border-[hsl(var(--primary)/0.48)] hover:bg-[hsl(var(--primary)/0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-65"
              disabled={isBusy}
              onClick={installUpdate}
              type="button"
            >
              {isBusy ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isBusy ? t("desktop.update.installing") : t("desktop.update.install")}
            </button>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.76)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={dismiss}
              type="button"
              aria-label={t("desktop.update.later")}
              title={t("desktop.update.later")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
