"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { useSocket } from "@/hooks/use-socket";
import { fetchUnreadCount, notificationsQueryKeys } from "@/lib/notifications/client";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import { fetchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import {
  WHISPR_DESKTOP_COMMAND_EVENT,
  isSafeDesktopInternalPath,
  isWhisprDesktopRuntime,
  type WhisprDesktopCommandDetail,
} from "@/lib/desktop/runtime";
import {
  configureDesktopVoiceShortcuts,
  hideDesktopGameOverlaySurface,
  getDesktopMainWindowFocused,
  publishDesktopGameOverlaySnapshot,
  publishDesktopVoiceMiniSnapshot,
  repairDesktopGameOverlaySurface,
  refreshDesktopCompanionSurfacesWithLayout,
  resolveDesktopGameOverlayHealth,
  setDesktopActivityStatus,
  setDesktopQuitOnCloseEnabled,
  setDesktopVoiceMiniVisible,
  type DesktopActivityStatus,
} from "@/lib/desktop/controls";
import { recordDesktopPerformanceMetric } from "@/lib/desktop/performance";
import { buildVoiceMiniSnapshot } from "@/lib/desktop/voice-mini";
import { useAppStore } from "@/lib/store";
import { useVoiceStore } from "@/store/voice-store";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import { useI18n } from "@/components/providers/locale-provider";

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (count?: number) => Promise<void>;
};

const DESKTOP_NOTIFICATION_TYPES = new Set<NotificationSocketPayload["type"]>([
  "DM",
  "MENTION",
  "FRIEND_REQUEST",
  "FRIEND_ACCEPTED",
  "SERVER_INVITE",
  "SYSTEM",
  "MODERATION",
]);
const DESKTOP_COMPANION_SURFACE_FOCUS_SETTLE_MS = 650;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

function getGenericNotificationBody(type: NotificationSocketPayload["type"]) {
  switch (type) {
    case "DM":
      return "New direct message in Whispr.";
    case "MENTION":
      return "You were mentioned in Whispr.";
    case "FRIEND_REQUEST":
      return "New friend request in Whispr.";
    case "FRIEND_ACCEPTED":
      return "A friend request was accepted in Whispr.";
    case "SERVER_INVITE":
      return "New server invitation in Whispr.";
    case "MODERATION":
      return "New moderation notification in Whispr.";
    case "SYSTEM":
    default:
      return "New Whispr notification.";
  }
}

function clampNotificationText(value: string, maxLength = 120) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function getNotificationCopy(payload: NotificationSocketPayload, showPreviews: boolean) {
  if (!showPreviews) {
    return {
      body: getGenericNotificationBody(payload.type),
      title: "Whispr",
    };
  }

  return {
    body: clampNotificationText(payload.body || getGenericNotificationBody(payload.type)),
    title: clampNotificationText(payload.title || "Whispr", 80),
  };
}

async function getNotificationApi() {
  try {
    return await import("@tauri-apps/plugin-notification");
  } catch {
    return null;
  }
}

function requestNotificationPermissionOnInteraction(enabled: boolean) {
  if (!enabled || typeof window === "undefined") {
    return () => undefined;
  }

  const requestPermission = () => {
    void getNotificationApi()
      .then(async (api) => {
        if (!api) {
          if ("Notification" in window && Notification.permission === "default") {
            await Notification.requestPermission().catch(() => undefined);
          }
          return;
        }

        if (!(await api.isPermissionGranted().catch(() => false))) {
          await api.requestPermission().catch(() => undefined);
        }
      })
      .catch(() => undefined);
  };

  window.addEventListener("pointerdown", requestPermission, { once: true });
  window.addEventListener("keydown", requestPermission, { once: true });

  return () => {
    window.removeEventListener("pointerdown", requestPermission);
    window.removeEventListener("keydown", requestPermission);
  };
}

async function sendNativeNotification(payload: NotificationSocketPayload, showPreviews: boolean) {
  const api = await getNotificationApi();

  if (!api || !(await api.isPermissionGranted().catch(() => false))) {
    return false;
  }

  const copy = getNotificationCopy(payload, showPreviews);
  api.sendNotification({
    body: copy.body,
    title: copy.title,
  });

  return true;
}

function sendWebNotificationFallback(
  payload: NotificationSocketPayload,
  showPreviews: boolean,
  onNavigate: (path: string) => void,
) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const copy = getNotificationCopy(payload, showPreviews);
  const notification = new Notification(copy.title, {
    body: copy.body,
    icon: "/app-icons/whispr.png",
    tag: payload.id,
  });

  notification.onclick = () => {
    window.focus();
    const actionUrl = payload.actionUrl;
    if (isSafeDesktopInternalPath(actionUrl)) {
      onNavigate(actionUrl);
    }
    notification.close();
  };
}

function applyAppBadge(unreadCount: number) {
  const badgeNavigator = navigator as BadgeNavigator;

  if (unreadCount > 0 && badgeNavigator.setAppBadge) {
    void badgeNavigator.setAppBadge(Math.min(unreadCount, 99)).catch(() => undefined);
    return;
  }

  if (badgeNavigator.clearAppBadge) {
    void badgeNavigator.clearAppBadge().catch(() => undefined);
  }
}

function DesktopConnectionHealth({
  isOnline,
  socketConnected,
  t,
}: {
  isOnline: boolean;
  socketConnected: boolean;
  t: (key: string) => string;
}) {
  if (isOnline && socketConnected) {
    return null;
  }

  const title = isOnline ? t("desktop.health.socket.title") : t("desktop.health.offline.title");
  const description = isOnline
    ? t("desktop.health.socket.description")
    : t("desktop.health.offline.description");

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[90] w-[min(92vw,520px)] -translate-x-1/2">
      <div className="pointer-events-auto rounded-[24px] border border-amber-200/80 bg-white/95 px-4 py-3 text-sm text-slate-700 shadow-[0_20px_60px_rgba(148,163,184,0.28)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="mt-1 inline-flex size-2.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_0_6px_rgba(251,191,36,0.16)]" />
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900">{title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function DesktopExperience() {
  const router = useRouter();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const {
    activeChannelId,
    connectionState,
    isDeafened,
    isMuted,
    isScreenSharing,
    leaveChannel,
    participants,
    startPushToTalk,
    stopPushToTalk,
    toggleDeafen,
    toggleMute,
  } = useVoiceConnection();
  const { t } = useI18n();
  const desktopNotificationPreviews = useAppStore((state) => state.desktopNotificationPreviews);
  const desktopCloseToTrayEnabled = useAppStore((state) => state.desktopCloseToTrayEnabled);
  const desktopRichPresenceEnabled = useAppStore((state) => state.desktopRichPresenceEnabled);
  const desktopStreamerModeEnabled = useAppStore((state) => state.desktopStreamerModeEnabled);
  const {
    desktopGlobalShortcutsEnabled,
    desktopGameOverlayAnchor,
    desktopGameOverlayEnabled,
    desktopGameOverlaySize,
    desktopGameOverlaySpeakingOnly,
    gameOverlayPanicShortcut,
    desktopVoiceMiniEnabled,
    pushToTalkShortcut,
    setDesktopGameOverlayEnabled,
    toggleDeafenShortcut,
    toggleMuteShortcut,
    voiceInputMode,
  } = useVoiceStore(
    useShallow((state) => ({
      desktopGlobalShortcutsEnabled: state.desktopGlobalShortcutsEnabled,
      desktopGameOverlayAnchor: state.desktopGameOverlayAnchor,
      desktopGameOverlayEnabled: state.desktopGameOverlayEnabled,
      desktopGameOverlaySize: state.desktopGameOverlaySize,
      desktopGameOverlaySpeakingOnly: state.desktopGameOverlaySpeakingOnly,
      gameOverlayPanicShortcut: state.gameOverlayPanicShortcut,
      desktopVoiceMiniEnabled: state.desktopVoiceMiniEnabled,
      pushToTalkShortcut: state.pushToTalkShortcut,
      setDesktopGameOverlayEnabled: state.setDesktopGameOverlayEnabled,
      toggleDeafenShortcut: state.toggleDeafenShortcut,
      toggleMuteShortcut: state.toggleMuteShortcut,
      voiceInputMode: state.voiceInputMode,
    })),
  );
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMainWindowFocused, setIsMainWindowFocused] = useState(true);
  const [desktopCompanionSurfacesGateOpen, setDesktopCompanionSurfacesGateOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const runtimeMetricRecordedRef = useRef(false);
  const gameOverlayVisibleRef = useRef(false);
  const voiceMiniVisibleRef = useRef(false);
  const overlayRecoveryInFlightRef = useRef(false);
  const lastOverlayRecoveryAtRef = useRef(0);

  const settingsQuery = useQuery({
    enabled: isDesktop,
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const unreadQuery = useQuery({
    enabled: isDesktop,
    queryFn: fetchUnreadCount,
    queryKey: notificationsQueryKeys.unreadCount,
    staleTime: 30_000,
  });

  const desktopNotificationsEnabled =
    settingsQuery.isSuccess && settingsQuery.data.desktopNotifications !== false;
  const desktopActivityStatus: DesktopActivityStatus = !desktopRichPresenceEnabled
    ? "idle"
    : !isOnline
      ? "offline"
      : activeChannelId && !socketConnected
        ? "reconnecting"
        : activeChannelId && connectionState !== "connected"
          ? "reconnecting"
          : activeChannelId && isScreenSharing
            ? "streaming"
            : activeChannelId
              ? "voice"
              : "idle";
  const desktopGameOverlayPreferences = useMemo(
    () => ({
      anchor: desktopGameOverlayAnchor,
      size: desktopGameOverlaySize,
      speakingOnly: desktopGameOverlaySpeakingOnly,
    }),
    [desktopGameOverlayAnchor, desktopGameOverlaySize, desktopGameOverlaySpeakingOnly],
  );
  const desktopGameOverlayLayout = useMemo(
    () => ({
      anchor: desktopGameOverlayAnchor,
      size: desktopGameOverlaySize,
    }),
    [desktopGameOverlayAnchor, desktopGameOverlaySize],
  );
  const canShowDesktopCompanionSurfaces =
    isDesktop && !isMainWindowFocused && desktopCompanionSurfacesGateOpen;
  const shouldShowGameOverlay =
    desktopGameOverlayEnabled && Boolean(activeChannelId) && canShowDesktopCompanionSurfaces;
  const shouldShowVoiceMini =
    desktopVoiceMiniEnabled && Boolean(activeChannelId) && canShowDesktopCompanionSurfaces;
  const publishGameOverlaySnapshot = useCallback(() => {
    if (!activeChannelId) {
      return;
    }

    const snapshot = buildVoiceMiniSnapshot({
      activeChannelId,
      connectionState,
      isDeafened,
      isMuted,
      overlayPreferences: desktopGameOverlayPreferences,
      participants,
      socketConnected,
    });

    void publishDesktopGameOverlaySnapshot(snapshot).catch(() => undefined);
  }, [
    activeChannelId,
    connectionState,
    desktopGameOverlayPreferences,
    isDeafened,
    isMuted,
    participants,
    socketConnected,
  ]);
  const publishVoiceMiniSnapshot = useCallback(() => {
    if (!activeChannelId) {
      return;
    }

    const snapshot = buildVoiceMiniSnapshot({
      activeChannelId,
      connectionState,
      isDeafened,
      isMuted,
      participants,
      socketConnected,
    });

    void publishDesktopVoiceMiniSnapshot(snapshot).catch(() => undefined);
  }, [activeChannelId, connectionState, isDeafened, isMuted, participants, socketConnected]);

  const repairGameOverlaySurface = useCallback(
    async (reason: "command" | "health-check" | "show" | "visibility") => {
      if (!isDesktop || !desktopGameOverlayEnabled || !activeChannelId || isMainWindowFocused) {
        return;
      }

      const now = performance.now();
      if (
        overlayRecoveryInFlightRef.current ||
        (reason !== "show" && now - lastOverlayRecoveryAtRef.current < 1_500)
      ) {
        return;
      }

      overlayRecoveryInFlightRef.current = true;
      lastOverlayRecoveryAtRef.current = now;
      const startedAt = performance.now();

      try {
        const status = await repairDesktopGameOverlaySurface(desktopGameOverlayLayout);
        const health = resolveDesktopGameOverlayHealth(status, true);
        publishGameOverlaySnapshot();
        recordDesktopPerformanceMetric({
          durationMs: performance.now() - startedAt,
          operation: "desktop_game_overlay_recovered",
          result: health === "ready" ? "success" : "failure",
        });
      } catch {
        recordDesktopPerformanceMetric({
          durationMs: performance.now() - startedAt,
          operation: "desktop_game_overlay_recovered",
          result: "failure",
        });
      } finally {
        overlayRecoveryInFlightRef.current = false;
      }
    },
    [
      activeChannelId,
      desktopGameOverlayEnabled,
      desktopGameOverlayLayout,
      isMainWindowFocused,
      isDesktop,
      publishGameOverlaySnapshot,
    ],
  );

  useEffect(() => {
    setIsDesktop(isWhisprDesktopRuntime());
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    let cancelled = false;
    let unlistenFocusChanged: (() => void) | null = null;

    const setMainWindowFocusedSafely = (focused: boolean) => {
      if (!cancelled) {
        setIsMainWindowFocused((current) => (current === focused ? current : focused));
      }
    };

    const syncDomMainWindowFocus = () => {
      setMainWindowFocusedSafely(
        document.visibilityState === "visible" && window.document.hasFocus(),
      );
    };

    const syncNativeMainWindowFocus = async () => {
      setMainWindowFocusedSafely(await getDesktopMainWindowFocused());
    };

    syncDomMainWindowFocus();
    void syncNativeMainWindowFocus();
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const unlisten = await getCurrentWindow().onFocusChanged(({ payload }) => {
          setMainWindowFocusedSafely(payload);
        });
        if (cancelled) {
          unlisten();
        } else {
          unlistenFocusChanged = unlisten;
        }
      } catch {
        // The DOM fallback below keeps browser/dev shells working when the
        // native focus API is not available or not permitted.
      }
    })();

    const focusCorrectionId = window.setInterval(() => {
      void syncNativeMainWindowFocus();
    }, 1_000);

    window.addEventListener("focus", syncDomMainWindowFocus);
    window.addEventListener("blur", syncDomMainWindowFocus);
    window.addEventListener("pageshow", syncDomMainWindowFocus);
    document.addEventListener("visibilitychange", syncDomMainWindowFocus);

    return () => {
      cancelled = true;
      window.clearInterval(focusCorrectionId);
      unlistenFocusChanged?.();
      window.removeEventListener("focus", syncDomMainWindowFocus);
      window.removeEventListener("blur", syncDomMainWindowFocus);
      window.removeEventListener("pageshow", syncDomMainWindowFocus);
      document.removeEventListener("visibilitychange", syncDomMainWindowFocus);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop || isMainWindowFocused) {
      setDesktopCompanionSurfacesGateOpen(false);
      return;
    }

    const settleTimerId = window.setTimeout(() => {
      setDesktopCompanionSurfacesGateOpen(true);
    }, DESKTOP_COMPANION_SURFACE_FOCUS_SETTLE_MS);

    return () => {
      window.clearTimeout(settleTimerId);
    };
  }, [isDesktop, isMainWindowFocused]);

  useEffect(() => {
    if (!isDesktop || runtimeMetricRecordedRef.current) {
      return;
    }

    runtimeMetricRecordedRef.current = true;
    recordDesktopPerformanceMetric({
      operation: "desktop_runtime_ready",
      result: "success",
    });
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    void setDesktopQuitOnCloseEnabled(!desktopCloseToTrayEnabled).catch(() => undefined);
  }, [desktopCloseToTrayEnabled, isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    void setDesktopActivityStatus(desktopActivityStatus)
      .then((updated) => {
        recordDesktopPerformanceMetric({
          operation: "desktop_activity_status_updated",
          result: updated ? "success" : "skipped",
        });
      })
      .catch(() => {
        recordDesktopPerformanceMetric({
          operation: "desktop_activity_status_updated",
          result: "failure",
        });
      });
  }, [desktopActivityStatus, isDesktop]);

  useEffect(
    () => () => {
      void setDesktopActivityStatus("idle").catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const syncOnlineState = () => setIsOnline(navigator.onLine);
    const syncSocketState = () => setSocketConnected(socket.connected);

    syncOnlineState();
    syncSocketState();

    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    socket.on("connect", syncSocketState);
    socket.on("connect_error", syncSocketState);
    socket.on("disconnect", syncSocketState);

    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
      socket.off("connect", syncSocketState);
      socket.off("connect_error", syncSocketState);
      socket.off("disconnect", syncSocketState);
    };
  }, [isDesktop, socket]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    return () => {
      void configureDesktopVoiceShortcuts({
        shortcutsEnabled: false,
      }).catch(() => undefined);
    };
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    void configureDesktopVoiceShortcuts({
      hideGameOverlay:
        desktopGlobalShortcutsEnabled && desktopGameOverlayEnabled
          ? gameOverlayPanicShortcut
          : null,
      pushToTalk:
        desktopGlobalShortcutsEnabled && voiceInputMode === "push-to-talk"
          ? pushToTalkShortcut
          : null,
      shortcutsEnabled: desktopGlobalShortcutsEnabled,
      toggleDeafen: desktopGlobalShortcutsEnabled ? toggleDeafenShortcut : null,
      toggleMute: desktopGlobalShortcutsEnabled ? toggleMuteShortcut : null,
    })
      .then((status) => {
        recordDesktopPerformanceMetric({
          operation: "desktop_shortcuts_configured",
          result: status === null ? "skipped" : "success",
        });
      })
      .catch(() => {
        recordDesktopPerformanceMetric({
          operation: "desktop_shortcuts_configured",
          result: "failure",
        });
      });
  }, [
    desktopGameOverlayEnabled,
    desktopGlobalShortcutsEnabled,
    gameOverlayPanicShortcut,
    isDesktop,
    pushToTalkShortcut,
    toggleDeafenShortcut,
    toggleMuteShortcut,
    voiceInputMode,
  ]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    if (!isMainWindowFocused) {
      return;
    }

    gameOverlayVisibleRef.current = false;
    voiceMiniVisibleRef.current = false;
    void hideDesktopGameOverlaySurface().catch(() => undefined);
    void setDesktopVoiceMiniVisible(false).catch(() => undefined);
  }, [isDesktop, isMainWindowFocused]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    if (isMainWindowFocused) {
      return;
    }

    if (gameOverlayVisibleRef.current !== shouldShowGameOverlay) {
      gameOverlayVisibleRef.current = shouldShowGameOverlay;
      const startedAt = performance.now();
      const visibilityTask = shouldShowGameOverlay
        ? repairDesktopGameOverlaySurface(desktopGameOverlayLayout)
        : hideDesktopGameOverlaySurface();

      void Promise.resolve(visibilityTask)
        .then(() => {
          if (shouldShowGameOverlay) {
            publishGameOverlaySnapshot();
          }
          recordDesktopPerformanceMetric({
            durationMs: performance.now() - startedAt,
            operation: "desktop_game_overlay_visible",
            result: "success",
          });
        })
        .catch(() => {
          gameOverlayVisibleRef.current = !shouldShowGameOverlay;
          recordDesktopPerformanceMetric({
            durationMs: performance.now() - startedAt,
            operation: "desktop_game_overlay_visible",
            result: "failure",
          });
        });
    }
  }, [
    desktopGameOverlayLayout,
    isDesktop,
    isMainWindowFocused,
    publishGameOverlaySnapshot,
    shouldShowGameOverlay,
  ]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    if (voiceMiniVisibleRef.current !== shouldShowVoiceMini) {
      voiceMiniVisibleRef.current = shouldShowVoiceMini;
      void setDesktopVoiceMiniVisible(shouldShowVoiceMini).catch(() => {
        voiceMiniVisibleRef.current = !shouldShowVoiceMini;
      });
    }
  }, [isDesktop, shouldShowVoiceMini]);

  useEffect(
    () => () => {
      if (gameOverlayVisibleRef.current) {
        gameOverlayVisibleRef.current = false;
        void hideDesktopGameOverlaySurface().catch(() => undefined);
      }
      if (voiceMiniVisibleRef.current) {
        voiceMiniVisibleRef.current = false;
        void setDesktopVoiceMiniVisible(false).catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    if (!shouldShowGameOverlay) {
      return;
    }

    publishGameOverlaySnapshot();
  }, [publishGameOverlaySnapshot, shouldShowGameOverlay]);

  useEffect(() => {
    if (!shouldShowVoiceMini) {
      return;
    }

    publishVoiceMiniSnapshot();
  }, [publishVoiceMiniSnapshot, shouldShowVoiceMini]);

  useEffect(() => {
    if (!isDesktop || (!shouldShowGameOverlay && !shouldShowVoiceMini)) {
      return;
    }

    let cancelled = false;
    const refreshSurfaces = () => {
      const startedAt = performance.now();
      void refreshDesktopCompanionSurfacesWithLayout(desktopGameOverlayLayout)
        .then((status) => {
          if (cancelled) {
            return;
          }

          const overlayHealth = resolveDesktopGameOverlayHealth(status, shouldShowGameOverlay);
          recordDesktopPerformanceMetric({
            durationMs: performance.now() - startedAt,
            operation: "desktop_companion_surfaces_refreshed",
            result: status ? "success" : "skipped",
          });
          recordDesktopPerformanceMetric({
            operation: "desktop_game_overlay_health",
            result: overlayHealth === "needs-repair" ? "failure" : "success",
          });

          if (overlayHealth === "needs-repair") {
            void repairGameOverlaySurface("health-check");
          }

          if (shouldShowGameOverlay) {
            publishGameOverlaySnapshot();
          }
          if (shouldShowVoiceMini) {
            publishVoiceMiniSnapshot();
          }
        })
        .catch(() => undefined);
    };

    refreshSurfaces();
    const intervalId = window.setInterval(refreshSurfaces, 2_500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    desktopGameOverlayLayout,
    isDesktop,
    publishGameOverlaySnapshot,
    publishVoiceMiniSnapshot,
    repairGameOverlaySurface,
    shouldShowGameOverlay,
    shouldShowVoiceMini,
  ]);

  useEffect(() => {
    if (!shouldShowGameOverlay) {
      return;
    }

    const refreshOverlayOnResize = () => {
      void repairGameOverlaySurface("visibility");
    };

    window.addEventListener("resize", refreshOverlayOnResize);

    return () => {
      window.removeEventListener("resize", refreshOverlayOnResize);
    };
  }, [repairGameOverlaySurface, shouldShowGameOverlay]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const handleDesktopCommand = (event: Event) => {
      const detail = (event as CustomEvent<WhisprDesktopCommandDetail>).detail;

      if (!detail?.command) {
        return;
      }

      switch (detail.command) {
        case "navigate":
          if (isSafeDesktopInternalPath(detail.path)) {
            router.push(detail.path);
          }
          break;
        case "open-desktop-diagnostics":
          router.push("/settings?section=desktop&panel=desktopDiagnostics");
          break;
        case "open-settings":
          router.push("/settings");
          break;
        case "hide-game-overlay":
          setDesktopGameOverlayEnabled(false);
          void hideDesktopGameOverlaySurface().then(() => {
            recordDesktopPerformanceMetric({
              operation: "desktop_game_overlay_panic_disabled",
              result: "success",
            });
          });
          break;
        case "refresh-game-overlay":
          void repairGameOverlaySurface("command");
          break;
        case "desktop-surface-ready":
          if (detail.surface === "game-overlay" && shouldShowGameOverlay) {
            publishGameOverlaySnapshot();
            void repairGameOverlaySurface("visibility");
          }
          if (detail.surface === "voice-mini" && shouldShowVoiceMini) {
            publishVoiceMiniSnapshot();
          }
          break;
        case "leave-voice":
          void leaveChannel();
          break;
        case "toggle-deafen":
          void toggleDeafen();
          break;
        case "toggle-mute":
          void toggleMute();
          break;
        case "voice-shortcut-push-to-talk-start":
          void startPushToTalk();
          break;
        case "voice-shortcut-push-to-talk-stop":
          void stopPushToTalk();
          break;
      }
    };

    window.addEventListener(WHISPR_DESKTOP_COMMAND_EVENT, handleDesktopCommand);

    return () => {
      window.removeEventListener(WHISPR_DESKTOP_COMMAND_EVENT, handleDesktopCommand);
    };
  }, [
    isDesktop,
    leaveChannel,
    publishGameOverlaySnapshot,
    publishVoiceMiniSnapshot,
    repairGameOverlaySurface,
    router,
    setDesktopGameOverlayEnabled,
    startPushToTalk,
    stopPushToTalk,
    shouldShowGameOverlay,
    shouldShowVoiceMini,
    toggleDeafen,
    toggleMute,
  ]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    return requestNotificationPermissionOnInteraction(desktopNotificationsEnabled);
  }, [desktopNotificationsEnabled, isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    applyAppBadge(desktopStreamerModeEnabled ? 0 : (unreadQuery.data ?? 0));
  }, [desktopStreamerModeEnabled, isDesktop, unreadQuery.data]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const handleNotification = (payload: NotificationSocketPayload) => {
      queryClient.setQueryData<number>(
        notificationsQueryKeys.unreadCount,
        (current) => (current ?? 0) + 1,
      );
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });

      if (
        desktopStreamerModeEnabled ||
        !desktopNotificationsEnabled ||
        document.visibilityState === "visible"
      ) {
        return;
      }

      if (DESKTOP_NOTIFICATION_TYPES.has(payload.type)) {
        void sendNativeNotification(payload, desktopNotificationPreviews).then((sent) => {
          if (!sent) {
            sendWebNotificationFallback(payload, desktopNotificationPreviews, (path) =>
              router.push(path),
            );
          }
        });
      }
    };

    const handleFriendsUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
    };

    socket.on("notification:new", handleNotification);
    socket.on("friends:updated", handleFriendsUpdated);

    return () => {
      socket.off("notification:new", handleNotification);
      socket.off("friends:updated", handleFriendsUpdated);
    };
  }, [
    desktopNotificationPreviews,
    desktopNotificationsEnabled,
    desktopStreamerModeEnabled,
    isDesktop,
    queryClient,
    router,
    socket,
  ]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const commandOrControl = event.metaKey || event.ctrlKey;

      if (commandOrControl && !event.altKey && !event.shiftKey && key === ",") {
        event.preventDefault();
        router.push("/settings");
        return;
      }

      if (commandOrControl && event.shiftKey && !event.altKey && key === "m") {
        event.preventDefault();
        void toggleMute();
        return;
      }

      if (commandOrControl && event.shiftKey && !event.altKey && key === "d") {
        event.preventDefault();
        void toggleDeafen();
        return;
      }

      if (commandOrControl && event.shiftKey && !event.altKey && key === "o") {
        event.preventDefault();
        setDesktopGameOverlayEnabled(false);
        void hideDesktopGameOverlaySurface().then(() => {
          recordDesktopPerformanceMetric({
            operation: "desktop_game_overlay_panic_disabled",
            result: "success",
          });
        });
        return;
      }

      if (
        (event.altKey && !event.ctrlKey && !event.metaKey && key === "arrowleft") ||
        (event.metaKey && !event.ctrlKey && !event.altKey && key === "[")
      ) {
        event.preventDefault();
        router.back();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDesktop, router, setDesktopGameOverlayEnabled, toggleDeafen, toggleMute]);

  if (!isDesktop) {
    return null;
  }

  return <DesktopConnectionHealth isOnline={isOnline} socketConnected={socketConnected} t={t} />;
}
