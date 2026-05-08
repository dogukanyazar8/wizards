"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/hooks/use-socket";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import { useI18n } from "@/components/providers/locale-provider";

type DiagnosticTone = "good" | "muted" | "warn";

function DiagnosticPill({
  label,
  tone,
}: {
  label: string;
  tone: DiagnosticTone;
}) {
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
  const voice = useVoiceConnection();
  const [isDesktop, setIsDesktop] = useState(false);
  const [origin, setOrigin] = useState("unknown");
  const [isOnline, setIsOnline] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("unknown");

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

    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
      socket.off("connect", syncSocketState);
      socket.off("connect_error", syncSocketState);
      socket.off("disconnect", syncSocketState);
    };
  }, [socket]);

  const voiceStatus =
    voice.activeChannelId && voice.connectionState === "connected"
      ? t("desktop.diagnostics.voice.connected")
      : voice.activeChannelId
        ? voice.connectionState
        : t("desktop.diagnostics.voice.idle");
  const notificationTone = notificationPermission === "granted" ? "good" : "warn";

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
      </div>
    </div>
  );
}
