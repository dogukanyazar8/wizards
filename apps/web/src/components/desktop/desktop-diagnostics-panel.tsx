"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/use-socket";
import {
  getDesktopCompanionSurfacesStatus,
  getDesktopAutostartEnabled,
  getDesktopPlatformCapabilities,
  hideDesktopGameOverlaySurface,
  repairDesktopGameOverlaySurface,
  refreshDesktopCompanionSurfaces,
  resolveDesktopGameOverlayHealth,
  setDesktopAutostartEnabled,
  type DesktopCompanionSurfacesStatus,
  type DesktopPlatformCapabilities,
  type DesktopPlatformFeature,
  type DesktopPlatformFeatureStatus,
} from "@/lib/desktop/controls";
import { recordDesktopPerformanceMetric } from "@/lib/desktop/performance";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { useAppStore } from "@/lib/store";
import { useVoiceStore } from "@/store/voice-store";
import { useVoiceState } from "@/components/providers/voice-provider";
import { useI18n } from "@/components/providers/locale-provider";

type DiagnosticTone = "good" | "muted" | "warn";

function DiagnosticPill({ label, tone }: { label: string; tone: DiagnosticTone }) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${toneClass}`}
    >
      {label}
    </span>
  );
}

function DiagnosticRow({
  detail,
  label,
  status,
  tone,
}: {
  detail: string;
  label: string;
  status: string;
  tone: DiagnosticTone;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white/78 p-4 shadow-[0_12px_36px_rgba(148,163,184,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <DiagnosticPill label={status} tone={tone} />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function getCapabilityTone(status: DesktopPlatformFeatureStatus | "unknown"): DiagnosticTone {
  if (status === "available") {
    return "good";
  }

  if (status === "research_gated") {
    return "warn";
  }

  return "muted";
}

function getCapabilityStatusLabel(
  status: DesktopPlatformFeatureStatus | "unknown",
  t: (key: string) => string,
) {
  return t(`desktop.diagnostics.capabilities.status.${status}`);
}

function formatCapabilityDetail(feature: DesktopPlatformFeature | null, fallback: string) {
  if (!feature) {
    return fallback;
  }

  return `${fallback} (${feature.strategy})`;
}

function formatSurfaceStatus(status: DesktopCompanionSurfacesStatus | null) {
  if (!status) {
    return "unknown";
  }

  const surfaces = [
    ["overlay", status.gameOverlay],
    ["mini", status.voiceMini],
  ] as const;

  return surfaces
    .map(([label, surface]) => {
      if (!surface.exists) {
        return `${label}: missing`;
      }

      const size =
        surface.width && surface.height ? `${surface.width}x${surface.height}` : "unknown-size";
      const position =
        surface.x !== null && surface.y !== null ? `@${surface.x},${surface.y}` : "@unknown";
      return `${label}: ${surface.visible ? "visible" : "hidden"} ${size} ${position}`;
    })
    .join(" · ");
}

function formatDesktopError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallback;
}

async function readNotificationPermission() {
  try {
    const api = await import("@tauri-apps/plugin-notification");
    if (await api.isPermissionGranted().catch(() => false)) {
      return "granted";
    }
  } catch {
    // Fall through to the browser Notification API when the Tauri plugin is absent.
  }

  if (typeof window !== "undefined" && "Notification" in window) {
    return Notification.permission;
  }

  return "unknown";
}

export function DesktopDiagnosticsPanel() {
  const { t } = useI18n();
  const socket = useSocket();
  const voice = useVoiceState();
  const desktopStreamerModeEnabled = useAppStore((state) => state.desktopStreamerModeEnabled);
  const setDesktopStreamerModeEnabled = useAppStore((state) => state.setDesktopStreamerModeEnabled);
  const desktopGameOverlayAnchor = useVoiceStore((state) => state.desktopGameOverlayAnchor);
  const desktopGameOverlayEnabled = useVoiceStore((state) => state.desktopGameOverlayEnabled);
  const desktopGameOverlaySize = useVoiceStore((state) => state.desktopGameOverlaySize);
  const setDesktopGameOverlayEnabled = useVoiceStore((state) => state.setDesktopGameOverlayEnabled);
  const [isDesktop, setIsDesktop] = useState(false);
  const [origin, setOrigin] = useState("unknown");
  const [isOnline, setIsOnline] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("unknown");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartPending, setAutostartPending] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [platformCapabilities, setPlatformCapabilities] =
    useState<DesktopPlatformCapabilities | null>(null);
  const [platformCapabilitiesError, setPlatformCapabilitiesError] = useState<string | null>(null);
  const [companionSurfaces, setCompanionSurfaces] = useState<DesktopCompanionSurfacesStatus | null>(
    null,
  );
  const [companionSurfacesError, setCompanionSurfacesError] = useState<string | null>(null);
  const [companionSurfacesPending, setCompanionSurfacesPending] = useState(false);

  useEffect(() => {
    setIsDesktop(isWhisprDesktopRuntime());
    setOrigin(window.location.origin);
    setIsOnline(navigator.onLine);
    setSocketConnected(socket.connected);

    const syncOnlineState = () => setIsOnline(navigator.onLine);
    const syncSocketState = () => setSocketConnected(socket.connected);

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    socket.on("connect", syncSocketState);
    socket.on("connect_error", syncSocketState);
    socket.on("disconnect", syncSocketState);

    void readNotificationPermission().then(setNotificationPermission);
    if (isWhisprDesktopRuntime()) {
      void getDesktopAutostartEnabled()
        .then((enabled) => {
          setAutostartEnabled(enabled);
          setAutostartError(null);
        })
        .catch(() => {
          setAutostartError(t("desktop.diagnostics.autostart.error"));
        });

      const capabilitiesStartedAt = performance.now();
      void getDesktopPlatformCapabilities()
        .then((capabilities) => {
          setPlatformCapabilities(capabilities);
          setPlatformCapabilitiesError(null);
          recordDesktopPerformanceMetric({
            durationMs: performance.now() - capabilitiesStartedAt,
            operation: "desktop_platform_capabilities_loaded",
            result: capabilities ? "success" : "skipped",
          });
        })
        .catch(() => {
          setPlatformCapabilitiesError(t("desktop.diagnostics.capabilities.error"));
          recordDesktopPerformanceMetric({
            durationMs: performance.now() - capabilitiesStartedAt,
            operation: "desktop_platform_capabilities_loaded",
            result: "failure",
          });
        });

      void getDesktopCompanionSurfacesStatus()
        .then((status) => {
          setCompanionSurfaces(status);
          setCompanionSurfacesError(status?.lastError ?? null);
        })
        .catch((error) => {
          setCompanionSurfaces(null);
          setCompanionSurfacesError(
            formatDesktopError(error, t("desktop.diagnostics.overlayWindows.error")),
          );
        });
    }

    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
      socket.off("connect", syncSocketState);
      socket.off("connect_error", syncSocketState);
      socket.off("disconnect", syncSocketState);
    };
  }, [socket, t]);

  const toggleAutostart = async () => {
    if (!isDesktop || autostartPending) {
      return;
    }

    const nextEnabled = !autostartEnabled;
    setAutostartPending(true);
    setAutostartError(null);
    try {
      const enabled = await setDesktopAutostartEnabled(nextEnabled);
      setAutostartEnabled(enabled);
    } catch {
      setAutostartError(t("desktop.diagnostics.autostart.error"));
    } finally {
      setAutostartPending(false);
    }
  };

  const refreshCompanionSurfaces = async () => {
    if (!isDesktop || companionSurfacesPending) {
      return;
    }

    setCompanionSurfacesPending(true);
    setCompanionSurfacesError(null);
    try {
      const status = await refreshDesktopCompanionSurfaces();
      setCompanionSurfaces(status);
      setCompanionSurfacesError(status?.lastError ?? null);
    } catch (error) {
      setCompanionSurfacesError(
        formatDesktopError(error, t("desktop.diagnostics.overlayWindows.error")),
      );
    } finally {
      setCompanionSurfacesPending(false);
    }
  };

  const repairGameOverlay = async () => {
    if (!isDesktop || companionSurfacesPending) {
      return;
    }

    setCompanionSurfacesPending(true);
    setCompanionSurfacesError(null);
    try {
      const status = await repairDesktopGameOverlaySurface({
        anchor: desktopGameOverlayAnchor,
        size: desktopGameOverlaySize,
      });
      setCompanionSurfaces(status);
      setCompanionSurfacesError(status?.lastError ?? null);
    } catch (error) {
      setCompanionSurfacesError(
        formatDesktopError(error, t("desktop.diagnostics.overlayWindows.error")),
      );
    } finally {
      setCompanionSurfacesPending(false);
    }
  };

  const hideGameOverlay = async () => {
    if (!isDesktop || companionSurfacesPending) {
      return;
    }

    setCompanionSurfacesPending(true);
    setCompanionSurfacesError(null);
    try {
      setDesktopGameOverlayEnabled(false);
      await hideDesktopGameOverlaySurface();
      const status = await getDesktopCompanionSurfacesStatus();
      setCompanionSurfaces(status);
      setCompanionSurfacesError(status?.lastError ?? null);
    } catch (error) {
      setCompanionSurfacesError(
        formatDesktopError(error, t("desktop.diagnostics.overlayWindows.error")),
      );
    } finally {
      setCompanionSurfacesPending(false);
    }
  };

  const voiceStatus =
    voice.activeChannelId && voice.connectionState === "connected"
      ? t("desktop.diagnostics.voice.connected")
      : voice.activeChannelId
        ? voice.connectionState
        : t("desktop.diagnostics.voice.idle");
  const notificationTone = notificationPermission === "granted" ? "good" : "warn";
  const unknownCapabilityStatus = getCapabilityStatusLabel("unknown", t);
  const overlayHealth = resolveDesktopGameOverlayHealth(
    companionSurfaces,
    Boolean(desktopGameOverlayEnabled && voice.activeChannelId),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/70 to-sky-50/80 p-5 text-sm text-slate-600 shadow-[0_18px_50px_rgba(99,102,241,0.12)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-500">
              {t("desktop.diagnostics.kicker")}
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">
              {t("desktop.diagnostics.title")}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("desktop.diagnostics.description")}
            </p>
          </div>
          <DiagnosticPill
            label={
              isDesktop
                ? t("desktop.diagnostics.runtime.desktop")
                : t("desktop.diagnostics.runtime.web")
            }
            tone={isDesktop ? "good" : "muted"}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DiagnosticRow
          detail={origin}
          label={t("desktop.diagnostics.origin.label")}
          status={
            isDesktop
              ? t("desktop.diagnostics.origin.allowed")
              : t("desktop.diagnostics.origin.browser")
          }
          tone={isDesktop ? "good" : "muted"}
        />
        <DiagnosticRow
          detail={t("desktop.diagnostics.network.detail")}
          label={t("desktop.diagnostics.network.label")}
          status={
            isOnline
              ? t("desktop.diagnostics.network.online")
              : t("desktop.diagnostics.network.offline")
          }
          tone={isOnline ? "good" : "warn"}
        />
        <DiagnosticRow
          detail={t("desktop.diagnostics.socket.detail")}
          label={t("desktop.diagnostics.socket.label")}
          status={
            socketConnected
              ? t("desktop.diagnostics.socket.connected")
              : t("desktop.diagnostics.socket.disconnected")
          }
          tone={socketConnected ? "good" : "warn"}
        />
        <DiagnosticRow
          detail={t("desktop.diagnostics.voice.detail")}
          label={t("desktop.diagnostics.voice.label")}
          status={voiceStatus}
          tone={voice.activeChannelId ? "good" : "muted"}
        />
        <DiagnosticRow
          detail={t("desktop.diagnostics.notifications.detail")}
          label={t("desktop.diagnostics.notifications.label")}
          status={notificationPermission}
          tone={notificationTone}
        />
        <DiagnosticRow
          detail={t("desktop.diagnostics.shell.detail")}
          label={t("desktop.diagnostics.shell.label")}
          status={t("desktop.diagnostics.shell.ready")}
          tone={isDesktop ? "good" : "muted"}
        />
        <div className="rounded-[22px] border border-slate-200/80 bg-white/78 p-4 shadow-[0_12px_36px_rgba(148,163,184,0.12)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">
              {t("desktop.diagnostics.overlayWindows.label")}
            </p>
            <DiagnosticPill
              label={
                overlayHealth === "needs-repair"
                  ? t("desktop.diagnostics.overlayWindows.needsRepair")
                  : companionSurfaces?.gameOverlay.visible || companionSurfaces?.voiceMini.visible
                    ? t("desktop.diagnostics.overlayWindows.visible")
                    : t("desktop.diagnostics.overlayWindows.idle")
              }
              tone={
                overlayHealth === "needs-repair"
                  ? "warn"
                  : companionSurfaces?.gameOverlay.visible || companionSurfaces?.voiceMini.visible
                    ? "good"
                    : "muted"
              }
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {companionSurfacesError ?? formatSurfaceStatus(companionSurfaces)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-9 items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isDesktop || companionSurfacesPending}
              onClick={() => void refreshCompanionSurfaces()}
              type="button"
            >
              {companionSurfacesPending
                ? t("desktop.diagnostics.overlayWindows.refreshing")
                : t("desktop.diagnostics.overlayWindows.refresh")}
            </button>
            <button
              className="inline-flex min-h-9 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isDesktop || companionSurfacesPending}
              onClick={() => void repairGameOverlay()}
              type="button"
            >
              {t("desktop.diagnostics.overlayWindows.repair")}
            </button>
            <button
              className="inline-flex min-h-9 items-center rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isDesktop || companionSurfacesPending}
              onClick={() => void hideGameOverlay()}
              type="button"
            >
              {t("desktop.diagnostics.overlayWindows.hide")}
            </button>
          </div>
        </div>
        <DiagnosticRow
          detail={
            platformCapabilities
              ? `${platformCapabilities.platform} / ${platformCapabilities.arch}`
              : (platformCapabilitiesError ?? t("desktop.diagnostics.capabilities.platform.detail"))
          }
          label={t("desktop.diagnostics.capabilities.platform.label")}
          status={
            platformCapabilities
              ? t("desktop.diagnostics.runtime.desktop")
              : unknownCapabilityStatus
          }
          tone={platformCapabilities ? "good" : "muted"}
        />
        <DiagnosticRow
          detail={formatCapabilityDetail(
            platformCapabilities?.nativeScreenCapture ?? null,
            t("desktop.diagnostics.capabilities.nativeScreenCapture.detail"),
          )}
          label={t("desktop.diagnostics.capabilities.nativeScreenCapture.label")}
          status={
            platformCapabilities
              ? getCapabilityStatusLabel(platformCapabilities.nativeScreenCapture.status, t)
              : unknownCapabilityStatus
          }
          tone={getCapabilityTone(platformCapabilities?.nativeScreenCapture.status ?? "unknown")}
        />
        <DiagnosticRow
          detail={formatCapabilityDetail(
            platformCapabilities?.systemAudioCapture ?? null,
            t("desktop.diagnostics.capabilities.systemAudioCapture.detail"),
          )}
          label={t("desktop.diagnostics.capabilities.systemAudioCapture.label")}
          status={
            platformCapabilities
              ? getCapabilityStatusLabel(platformCapabilities.systemAudioCapture.status, t)
              : unknownCapabilityStatus
          }
          tone={getCapabilityTone(platformCapabilities?.systemAudioCapture.status ?? "unknown")}
        />
        <DiagnosticRow
          detail={formatCapabilityDetail(
            platformCapabilities?.hardwareEncode ?? null,
            t("desktop.diagnostics.capabilities.hardwareEncode.detail"),
          )}
          label={t("desktop.diagnostics.capabilities.hardwareEncode.label")}
          status={
            platformCapabilities
              ? getCapabilityStatusLabel(platformCapabilities.hardwareEncode.status, t)
              : unknownCapabilityStatus
          }
          tone={getCapabilityTone(platformCapabilities?.hardwareEncode.status ?? "unknown")}
        />
        <DiagnosticRow
          detail={formatCapabilityDetail(
            platformCapabilities?.richPresence ?? null,
            t("desktop.diagnostics.capabilities.richPresence.detail"),
          )}
          label={t("desktop.diagnostics.capabilities.richPresence.label")}
          status={
            platformCapabilities
              ? getCapabilityStatusLabel(platformCapabilities.richPresence.status, t)
              : unknownCapabilityStatus
          }
          tone={getCapabilityTone(platformCapabilities?.richPresence.status ?? "unknown")}
        />
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-white/78 p-4 shadow-[0_12px_36px_rgba(148,163,184,0.12)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {t("desktop.diagnostics.autostart.label")}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {t("desktop.diagnostics.autostart.detail")}
            </p>
            {autostartError ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">{autostartError}</p>
            ) : null}
          </div>
          <button
            aria-checked={autostartEnabled}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
              autostartEnabled ? "border-indigo-300 bg-indigo-100" : "border-slate-200 bg-slate-100"
            } ${autostartPending || !isDesktop ? "cursor-not-allowed opacity-60" : ""}`}
            disabled={autostartPending || !isDesktop}
            onClick={() => void toggleAutostart()}
            role="switch"
            type="button"
          >
            <span
              className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-[0_6px_16px_rgba(15,23,42,0.14)] transition ${
                autostartEnabled ? "translate-x-6 bg-indigo-500" : ""
              }`}
            />
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-white/78 p-4 shadow-[0_12px_36px_rgba(148,163,184,0.12)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {t("desktop.diagnostics.streamerMode.label")}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {t("desktop.diagnostics.streamerMode.detail")}
            </p>
          </div>
          <button
            aria-checked={desktopStreamerModeEnabled}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 ${
              desktopStreamerModeEnabled
                ? "border-indigo-300 bg-indigo-100"
                : "border-slate-200 bg-slate-100"
            }`}
            onClick={() => setDesktopStreamerModeEnabled(!desktopStreamerModeEnabled)}
            role="switch"
            type="button"
          >
            <span
              className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-[0_6px_16px_rgba(15,23,42,0.14)] transition ${
                desktopStreamerModeEnabled ? "translate-x-6 bg-indigo-500" : ""
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
