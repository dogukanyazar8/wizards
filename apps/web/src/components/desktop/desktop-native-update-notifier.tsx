"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import {
  canUseDesktopNativeUpdater,
  checkDesktopNativeUpdate,
  dismissDesktopUpdateVersion,
  downloadInstallAndRelaunchDesktopUpdate,
  getDesktopNativeUpdateInfo,
  getDismissedDesktopUpdateVersion,
  type DesktopNativeUpdateDownloadState,
  type DesktopNativeUpdateInfo,
  type DesktopNativeUpdateStatus,
  verifyPendingDesktopUpdateInstallation,
} from "@/lib/desktop/updater";
import { cn } from "@/lib/utils";

const DESKTOP_UPDATE_RECHECK_MS = 6 * 60 * 60 * 1000;

type NativeUpdate = Awaited<ReturnType<typeof checkDesktopNativeUpdate>>;

function formatDownloadProgress(state: DesktopNativeUpdateDownloadState | null) {
  if (!state?.totalBytes) {
    return null;
  }

  return Math.min(100, Math.round((state.downloadedBytes / state.totalBytes) * 100));
}

export function DesktopNativeUpdateNotifier() {
  const { t } = useI18n();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const updateRef = useRef<NativeUpdate>(null);
  const [downloadState, setDownloadState] = useState<DesktopNativeUpdateDownloadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [status, setStatus] = useState<DesktopNativeUpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<DesktopNativeUpdateInfo | null>(null);

  const canUseUpdater = canUseDesktopNativeUpdater();

  const checkForUpdate = useCallback(
    async (options?: { reveal?: boolean }) => {
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
          setDownloadState(null);
          setUpdateInfo(null);
          setStatus("idle");
          setPanelOpen(false);
          return;
        }

        const nextInfo = getDesktopNativeUpdateInfo(update);

        if (getDismissedDesktopUpdateVersion() === nextInfo.version) {
          setStatus("idle");
          return;
        }

        setUpdateInfo(nextInfo);
        setStatus("ready");

        if (options?.reveal) {
          setPanelOpen(true);
        }
      } catch {
        setStatus("error");
        setError(t("desktop.update.error"));
      }
    },
    [t],
  );

  useEffect(() => {
    if (!canUseUpdater) {
      return;
    }

    let cancelled = false;

    const verifyAndCheck = async () => {
      const verification = await verifyPendingDesktopUpdateInstallation();
      if (cancelled) {
        return;
      }

      if (verification && verification.status !== "matched") {
        updateRef.current = null;
        setDownloadState(null);
        setUpdateInfo({
          currentVersion: verification.currentVersion ?? t("settings.about.buildInfo.unknown"),
          releaseRing: verification.releaseRing,
          version: verification.expectedVersion,
        });
        setStatus("error");
        setPanelOpen(true);
        setError(
          verification.status === "unavailable"
            ? t("desktop.update.verifyUnavailable", {
                expected: verification.expectedVersion,
              })
            : t("desktop.update.verifyError", {
                actual: verification.currentVersion ?? t("settings.about.buildInfo.unknown"),
                expected: verification.expectedVersion,
              }),
        );
        return;
      }

      await checkForUpdate({ reveal: false });
    };

    void verifyAndCheck();

    const intervalId = window.setInterval(() => {
      void checkForUpdate({ reveal: false });
    }, DESKTOP_UPDATE_RECHECK_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate({ reveal: false });
      }
    };

    const handleOnline = () => {
      void checkForUpdate({ reveal: false });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleOnline);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleOnline);
    };
  }, [canUseUpdater, checkForUpdate, t]);

  useEffect(() => {
    if (!panelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) {
        return;
      }

      setPanelOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [panelOpen]);

  const progress = useMemo(() => formatDownloadProgress(downloadState), [downloadState]);

  if (!canUseUpdater || !updateInfo || status === "idle") {
    return null;
  }

  const dismiss = () => {
    dismissDesktopUpdateVersion(updateInfo.version);
    setPanelOpen(false);
    setDownloadState(null);
    setUpdateInfo(null);
    setStatus("idle");
  };

  const installUpdate = async () => {
    if (!updateRef.current) {
      return;
    }

    setPanelOpen(true);
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
  const isChecking = status === "checking";
  const isError = status === "error";

  return (
    <div ref={rootRef} className="relative flex h-full items-center">
      <button
        aria-controls={panelId}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        className={cn(
          "group inline-flex h-7 max-w-[190px] items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
          isError
            ? "border-rose-300/70 bg-rose-50 text-rose-700 hover:bg-rose-100"
            : "border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] shadow-[0_8px_22px_hsl(var(--primary)/0.08)] hover:border-[hsl(var(--primary)/0.42)] hover:bg-[hsl(var(--primary)/0.14)]",
        )}
        onClick={() => {
          setPanelOpen((open) => !open);
        }}
        title={t(isError ? "desktop.update.errorShort" : "desktop.update.pillReady")}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded-md",
            isError ? "bg-rose-100 text-rose-600" : "bg-white/72 text-[hsl(var(--primary))]",
          )}
        >
          {isError ? <AlertTriangle className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
        </span>
        <span className="truncate">
          {isBusy
            ? t("desktop.update.installing")
            : isError
              ? t("desktop.update.errorShort")
              : t("desktop.update.pillReady")}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-3 w-3 shrink-0 transition", panelOpen && "rotate-180")}
        />
      </button>

      {panelOpen ? (
        <section
          aria-label={t("desktop.update.title")}
          className="absolute right-0 top-[calc(100%+0.55rem)] z-[150] w-[340px] overflow-hidden rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--background)/0.96)] text-app-foreground shadow-[0_24px_60px_hsl(var(--foreground)/0.16)] backdrop-blur-2xl"
          id={panelId}
          role="dialog"
        >
          <div className="flex items-start gap-3 p-3.5">
            <div
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
                isError
                  ? "border-rose-200 bg-rose-50 text-rose-600"
                  : "border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]",
              )}
            >
              {isError ? (
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[hsl(var(--primary))]">
                {t("desktop.update.badge")}
              </p>
              <h2 className="mt-1 text-[13px] font-black leading-5 text-app-foreground">
                {t("desktop.update.title")}
              </h2>
              <p className="mt-1 text-[11px] leading-4 text-app-muted">
                {t("desktop.update.description", {
                  current: updateInfo.currentVersion,
                  latest: updateInfo.version,
                  ring: updateInfo.releaseRing,
                })}
              </p>
            </div>
            <button
              aria-label={t("desktop.update.later")}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.78)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={dismiss}
              title={t("desktop.update.later")}
              type="button"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="border-t border-[hsl(var(--border)/0.48)] px-3.5 py-3">
            <div className="rounded-xl bg-[hsl(var(--surface-soft)/0.56)] px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="font-bold text-app-muted">{t("desktop.update.versionLabel")}</span>
                <span className="truncate font-black text-app-foreground">
                  {t("desktop.update.versionLine", {
                    current: updateInfo.currentVersion,
                    latest: updateInfo.version,
                  })}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
                <span className="font-bold text-app-muted">{t("desktop.update.ringLabel")}</span>
                <span className="truncate font-black text-[hsl(var(--primary))]">
                  {updateInfo.releaseRing}
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-[hsl(var(--primary)/0.14)] bg-[hsl(var(--primary)/0.07)] px-3 py-2 text-[11px] leading-4 text-app-muted">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--primary))]"
              />
              <span>{t("desktop.update.securityNote")}</span>
            </div>

            {error ? (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-semibold leading-4 text-rose-700">
                {error}
              </p>
            ) : null}

            {progress !== null ? (
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-app-muted">
                  <span>{t("desktop.update.progressLabel")}</span>
                  <span>{t("desktop.update.progressValue", { progress })}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--surface-soft))]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--accent)))] transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <button
                className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3 text-[11px] font-black text-white shadow-[0_12px_28px_hsl(var(--primary)/0.2)] transition hover:bg-[hsl(var(--primary)/0.92)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-65"
                disabled={isBusy || isChecking || !updateRef.current}
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
                aria-label={t("desktop.update.checkAgain")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[hsl(var(--border)/0.72)] text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.76)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-65"
                disabled={isBusy || isChecking}
                onClick={() => {
                  void checkForUpdate({ reveal: true });
                }}
                title={t("desktop.update.checkAgain")}
                type="button"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isChecking && "animate-spin")}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
