"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { DesktopConnectionHealth } from "./desktop-connection-health";
import { useSocket } from "@/hooks/use-socket";
import { fetchUnreadCount, notificationsQueryKeys } from "@/lib/notifications/client";
import { shouldDeliverDesktopNotification } from "@/lib/notifications/desktop-mention-policy";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import {
  fetchLayoutSettings,
  fetchMentionSettings,
  settingsQueryKeys,
} from "@/lib/settings/client";
import { MENTION_SETTINGS_DEFAULTS } from "@wizards/types";
import { buildSettingsHref, DEFAULT_SETTINGS_ROUTE } from "@/lib/settings/navigation";
import {
  getWhisprDesktopBeforeCloseRequestId,
  isWhisprDesktopRuntime,
  type WhisprDesktopCommandDetail,
  WHISPR_DESKTOP_BEFORE_CLOSE_EVENT,
  WHISPR_DESKTOP_COMMAND_EVENT,
} from "@/lib/desktop/runtime";
import {
  getDesktopAdminConsoleOpen,
  getDesktopForegroundProcessName,
  getDesktopMainWindowFocused,
  getDesktopVoiceShortcutStatus,
  hideDesktopGameOverlaySurface,
  publishDesktopAdminCaseCount,
  setDesktopAdminConsoleVisible,
  publishDesktopGameOverlaySnapshot,
  publishDesktopVoiceMiniSnapshot,
  repairDesktopGameOverlaySurface,
  refreshDesktopCompanionSurfacesWithLayout,
  resolveDesktopGameOverlayHealth,
  setDesktopActivityStatus,
  setDesktopVoiceMiniVisible,
  WHISPR_DESKTOP_VOICE_MINI_COMMAND_CHANNEL,
  type DesktopVoiceMiniCommand,
  type DesktopActivityStatus,
} from "@/lib/desktop/controls";
import {
  isDesktopGameOverlayOperationInFlight,
  transitionDesktopGameOverlayState,
  type DesktopGameOverlayEvent,
  type DesktopGameOverlayState,
} from "@/lib/desktop/game-overlay-state";
import { resolveDesktopGameOverlayProcessGate } from "@/lib/desktop/game-overlay-process";
import { recordDesktopPerformanceMetric } from "@/lib/desktop/performance";
import { canPublishDesktopRichPresence, resolveDesktopStreamerMode } from "@/lib/desktop/privacy";
import { buildVoiceMiniSnapshot } from "@/lib/desktop/voice-mini";
import { matchesAppShortcut } from "@/lib/shortcuts/catalog";
import { useAppStore } from "@/lib/store";
import { useVoiceStore } from "@/store/voice-store";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import { useI18n } from "@/components/providers/locale-provider";

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (count?: number) => Promise<void>;
};
const subscribeToDesktopRuntime = () => () => {};

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
const DESKTOP_COMPANION_SURFACE_REFRESH_MS = 5_000;
const DESKTOP_GAME_OVERLAY_PROCESS_POLL_MS = 2_000;
const DESKTOP_GAME_OVERLAY_REPAIR_COOLDOWN_MS = 1_500;
const DESKTOP_RESUME_CHECK_INTERVAL_MS = 10_000;
const DESKTOP_RESUME_GAP_MS = 45_000;
const DESKTOP_SHORTCUT_COMMANDS = new Set<WhisprDesktopCommandDetail["command"]>([
  "hide-game-overlay",
  "toggle-admin-console",
  "toggle-deafen",
  "toggle-mute",
  "voice-shortcut-push-to-talk-start",
  "voice-shortcut-push-to-talk-stop",
]);
type DesktopCompanionSurfaceHideReason =
  "before-close" | "focus" | "offline" | "resume" | "unmount";

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

async function sendNativeNotification(payload: NotificationSocketPayload, showPreviews: boolean) {
  try {
    const { nativeSettingsClient } = await import("@/lib/desktop/settings-client");
    if ((await nativeSettingsClient.notificationPermission()) !== "granted") return false;
    const copy = getNotificationCopy(payload, showPreviews);
    await nativeSettingsClient.sendNotification(copy.title, copy.body);
    return true;
  } catch {
    return false;
  }
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

function isDesktopVoiceMiniCommand(value: unknown): value is DesktopVoiceMiniCommand {
  return value === "leaveVoice" || value === "toggleDeafen" || value === "toggleMute";
}

function recordDesktopShortcutLatency(detail: WhisprDesktopCommandDetail) {
  if (!DESKTOP_SHORTCUT_COMMANDS.has(detail.command) || typeof detail.issuedAtMs !== "number") {
    return;
  }

  const latencyMs = Date.now() - detail.issuedAtMs;
  if (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 60_000) {
    return;
  }

  recordDesktopPerformanceMetric({
    durationMs: latencyMs,
    operation: "desktop_shortcut_latency",
    result: "success",
  });
}

export function DesktopExperience() {
  const screenShareViewerCounts = useVoiceStore((state) => state.screenShareViewerCounts);
  const sharingScreen = useVoiceStore((state) => state.isScreenSharing);
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
  const { locale, t } = useI18n();
  const desktopNotificationPreviews = useAppStore((state) => state.desktopNotificationPreviews);
  const desktopRichPresenceAudience = useAppStore((state) => state.desktopRichPresenceAudience);
  const desktopRichPresenceEnabled = useAppStore((state) => state.desktopRichPresenceEnabled);
  const desktopStreamerModeProcessDetectionEnabled = useAppStore(
    (state) => state.desktopStreamerModeProcessDetectionEnabled,
  );
  const desktopStreamerModeEnabled = useAppStore((state) => state.desktopStreamerModeEnabled);
  const setDesktopStreamerModeDetected = useAppStore(
    (state) => state.setDesktopStreamerModeDetected,
  );
  const {
    desktopGameOverlayAnchor,
    desktopGameOverlayEnabled,
    desktopGameOverlayGameSettings,
    desktopGameOverlayProcessDetectionEnabled,
    desktopGameOverlaySize,
    desktopGameOverlaySpeakingOnly,
    desktopVoiceMiniEnabled,
    setDesktopGameOverlayEnabled,
    setDesktopGlobalShortcutsEnabled,
  } = useVoiceStore(
    useShallow((state) => ({
      desktopGameOverlayAnchor: state.desktopGameOverlayAnchor,
      desktopGameOverlayEnabled: state.desktopGameOverlayEnabled,
      desktopGameOverlayGameSettings: state.desktopGameOverlayGameSettings,
      desktopGameOverlayProcessDetectionEnabled: state.desktopGameOverlayProcessDetectionEnabled,
      desktopGameOverlaySize: state.desktopGameOverlaySize,
      desktopGameOverlaySpeakingOnly: state.desktopGameOverlaySpeakingOnly,
      desktopVoiceMiniEnabled: state.desktopVoiceMiniEnabled,
      setDesktopGameOverlayEnabled: state.setDesktopGameOverlayEnabled,
      setDesktopGlobalShortcutsEnabled: state.setDesktopGlobalShortcutsEnabled,
    })),
  );
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopRuntime,
    isWhisprDesktopRuntime,
    () => false,
  );

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    let active = true;
    const syncShortcutStatus = () => {
      void getDesktopVoiceShortcutStatus()
        .then((status) => {
          if (active && status) {
            setDesktopGlobalShortcutsEnabled(status.enabled);
          }
        })
        .catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncShortcutStatus();
      }
    };

    syncShortcutStatus();
    window.addEventListener("focus", syncShortcutStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("focus", syncShortcutStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktop, setDesktopGlobalShortcutsEnabled]);
  const [isMainWindowFocused, setIsMainWindowFocused] = useState(true);
  const [desktopCompanionSurfacesGateOpen, setDesktopCompanionSurfacesGateOpen] = useState(false);
  const [detectedForegroundProcessName, setDetectedForegroundProcessName] = useState<string | null>(
    null,
  );
  const processDetectionEnabled =
    desktopGameOverlayProcessDetectionEnabled || desktopStreamerModeProcessDetectionEnabled;
  const foregroundProcessName =
    isDesktop && processDetectionEnabled && !isMainWindowFocused
      ? detectedForegroundProcessName
      : null;
  const [gameOverlayState, setGameOverlayState] = useState<DesktopGameOverlayState>("hidden");
  const [isOnline, setIsOnline] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const runtimeMetricRecordedRef = useRef(false);
  const gameOverlayStateRef = useRef<DesktopGameOverlayState>("hidden");
  const gameOverlayVisibleRef = useRef(false);
  const overlayOperationIdRef = useRef(0);
  const voiceMiniVisibleRef = useRef(false);
  const voiceJoinTimingRef = useRef<{ channelId: string; startedAt: number } | null>(null);
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

  const mentionSettingsQuery = useQuery({
    enabled: isDesktop,
    queryFn: fetchMentionSettings,
    queryKey: settingsQueryKeys.mentions,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    gameOverlayStateRef.current = gameOverlayState;
  }, [gameOverlayState]);

  const transitionGameOverlayState = useCallback((event: DesktopGameOverlayEvent) => {
    setGameOverlayState((current) => transitionDesktopGameOverlayState(current, event));
  }, []);

  const desktopNotificationsEnabled =
    settingsQuery.isSuccess && settingsQuery.data.desktopNotifications !== false;
  const desktopStreamerMode = useMemo(
    () =>
      resolveDesktopStreamerMode({
        foregroundProcessName,
        manualEnabled: desktopStreamerModeEnabled,
        processDetectionEnabled: desktopStreamerModeProcessDetectionEnabled,
      }),
    [desktopStreamerModeEnabled, desktopStreamerModeProcessDetectionEnabled, foregroundProcessName],
  );
  const effectiveDesktopStreamerModeEnabled = desktopStreamerMode.active;
  const desktopRichPresenceCanPublish = canPublishDesktopRichPresence({
    audience: desktopRichPresenceAudience,
    enabled: desktopRichPresenceEnabled,
  });
  const desktopActivityStatus: DesktopActivityStatus = !desktopRichPresenceCanPublish
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

  useEffect(() => {
    if (!isDesktop) {
      setDesktopStreamerModeDetected(false);
      return;
    }

    setDesktopStreamerModeDetected(desktopStreamerMode.reason === "detected");

    return () => {
      setDesktopStreamerModeDetected(false);
    };
  }, [desktopStreamerMode.reason, isDesktop, setDesktopStreamerModeDetected]);

  const gameOverlayProcessGate = useMemo(
    () =>
      resolveDesktopGameOverlayProcessGate({
        fallbackPreference: {
          anchor: desktopGameOverlayAnchor,
          enabled: desktopGameOverlayEnabled,
          size: desktopGameOverlaySize,
          speakingOnly: desktopGameOverlaySpeakingOnly,
        },
        foregroundProcessName,
        gameSettings: desktopGameOverlayGameSettings,
        processDetectionEnabled: desktopGameOverlayProcessDetectionEnabled,
      }),
    [
      desktopGameOverlayAnchor,
      desktopGameOverlayEnabled,
      desktopGameOverlayGameSettings,
      desktopGameOverlayProcessDetectionEnabled,
      desktopGameOverlaySize,
      desktopGameOverlaySpeakingOnly,
      foregroundProcessName,
    ],
  );
  const desktopGameOverlayPreferences = useMemo(() => {
    const perGamePreference = gameOverlayProcessGate.preference;

    return {
      anchor: perGamePreference?.anchor ?? desktopGameOverlayAnchor,
      size: perGamePreference?.size ?? desktopGameOverlaySize,
      speakingOnly: perGamePreference?.speakingOnly ?? desktopGameOverlaySpeakingOnly,
    };
  }, [
    desktopGameOverlayAnchor,
    desktopGameOverlaySize,
    desktopGameOverlaySpeakingOnly,
    gameOverlayProcessGate.preference,
  ]);
  const desktopGameOverlayLayout = useMemo(
    () => ({
      anchor: desktopGameOverlayPreferences.anchor,
      size: desktopGameOverlayPreferences.size,
    }),
    [desktopGameOverlayPreferences.anchor, desktopGameOverlayPreferences.size],
  );
  const canShowDesktopCompanionSurfaces =
    isDesktop && !isMainWindowFocused && desktopCompanionSurfacesGateOpen;
  const shouldShowGameOverlay =
    desktopGameOverlayEnabled &&
    gameOverlayProcessGate.allowed &&
    Boolean(activeChannelId) &&
    canShowDesktopCompanionSurfaces;
  const shouldShowVoiceMini =
    desktopVoiceMiniEnabled && Boolean(activeChannelId) && canShowDesktopCompanionSurfaces;
  const publishGameOverlaySnapshot = useCallback(() => {
    if (!activeChannelId) {
      return;
    }

    const localUserId = participants.find((participant) => participant.isLocal)?.userId;
    const snapshot = buildVoiceMiniSnapshot({
      isScreenSharing: sharingScreen,
      screenShareViewerCount: localUserId ? (screenShareViewerCounts[localUserId] ?? 0) : 0,
      activeChannelId,
      connectionState,
      isDeafened,
      isMuted,
      overlayPreferences: desktopGameOverlayPreferences,
      participants,
      privacyMode: effectiveDesktopStreamerModeEnabled ? "streamer" : "standard",
      socketConnected,
    });

    void publishDesktopGameOverlaySnapshot(snapshot).catch(() => undefined);
  }, [
    activeChannelId,
    connectionState,
    desktopGameOverlayPreferences,
    effectiveDesktopStreamerModeEnabled,
    isDeafened,
    isMuted,
    participants,
    socketConnected,
    sharingScreen,
    screenShareViewerCounts,
  ]);
  const publishVoiceMiniSnapshot = useCallback(() => {
    if (!activeChannelId) {
      return;
    }

    const localUserId = participants.find((participant) => participant.isLocal)?.userId;
    const snapshot = buildVoiceMiniSnapshot({
      isScreenSharing: sharingScreen,
      screenShareViewerCount: localUserId ? (screenShareViewerCounts[localUserId] ?? 0) : 0,
      activeChannelId,
      connectionState,
      isDeafened,
      isMuted,
      participants,
      socketConnected,
    });

    void publishDesktopVoiceMiniSnapshot(snapshot).catch(() => undefined);
  }, [
    activeChannelId,
    connectionState,
    isDeafened,
    isMuted,
    participants,
    socketConnected,
    sharingScreen,
    screenShareViewerCounts,
  ]);

  const hideDesktopCompanionSurfaces = useCallback(
    async (_reason: DesktopCompanionSurfaceHideReason) => {
      void _reason;
      const hadGameOverlay = gameOverlayVisibleRef.current;
      const hadVoiceMini = voiceMiniVisibleRef.current;

      if (!hadGameOverlay && !hadVoiceMini) {
        return;
      }

      gameOverlayVisibleRef.current = false;
      voiceMiniVisibleRef.current = false;
      overlayRecoveryInFlightRef.current = false;
      overlayOperationIdRef.current += 1;
      transitionGameOverlayState({ type: "hide" });

      const startedAt = performance.now();
      const cleanupTasks: Promise<unknown>[] = [];

      if (hadGameOverlay) {
        cleanupTasks.push(hideDesktopGameOverlaySurface());
      }

      if (hadVoiceMini) {
        cleanupTasks.push(setDesktopVoiceMiniVisible(false));
      }

      const results = await Promise.allSettled(cleanupTasks);
      recordDesktopPerformanceMetric({
        durationMs: performance.now() - startedAt,
        operation: "desktop_companion_surfaces_hidden",
        result: results.every((result) => result.status === "fulfilled") ? "success" : "failure",
      });
    },
    [transitionGameOverlayState],
  );

  const repairGameOverlaySurface = useCallback(
    async (reason: "command" | "health-check" | "show" | "visibility") => {
      if (
        !isDesktop ||
        !desktopGameOverlayEnabled ||
        !activeChannelId ||
        isMainWindowFocused ||
        !desktopCompanionSurfacesGateOpen
      ) {
        return;
      }

      const now = performance.now();
      if (
        overlayRecoveryInFlightRef.current ||
        isDesktopGameOverlayOperationInFlight(gameOverlayStateRef.current) ||
        (reason !== "show" &&
          now - lastOverlayRecoveryAtRef.current < DESKTOP_GAME_OVERLAY_REPAIR_COOLDOWN_MS)
      ) {
        return;
      }

      overlayRecoveryInFlightRef.current = true;
      lastOverlayRecoveryAtRef.current = now;
      transitionGameOverlayState({ type: "repair-requested" });
      const operationId = ++overlayOperationIdRef.current;
      const startedAt = performance.now();

      try {
        const status = await repairDesktopGameOverlaySurface(desktopGameOverlayLayout);
        const health = resolveDesktopGameOverlayHealth(status, true);
        if (overlayOperationIdRef.current === operationId) {
          gameOverlayVisibleRef.current = health === "ready";
          transitionGameOverlayState({
            type: health === "ready" ? "repair-succeeded" : "repair-failed",
          });
        }
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
        if (overlayOperationIdRef.current === operationId) {
          gameOverlayVisibleRef.current = false;
          transitionGameOverlayState({ type: "repair-failed" });
        }
      } finally {
        overlayRecoveryInFlightRef.current = false;
      }
    },
    [
      activeChannelId,
      desktopCompanionSurfacesGateOpen,
      desktopGameOverlayEnabled,
      desktopGameOverlayLayout,
      isMainWindowFocused,
      isDesktop,
      publishGameOverlaySnapshot,
      transitionGameOverlayState,
    ],
  );

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    let cancelled = false;
    let unlistenFocusChanged: (() => void) | null = null;

    const setMainWindowFocusedSafely = (focused: boolean) => {
      if (!cancelled) {
        if (focused) {
          setDesktopCompanionSurfacesGateOpen(false);
        }
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
    if (!isDesktop || !processDetectionEnabled || isMainWindowFocused) {
      return;
    }

    let cancelled = false;
    const syncForegroundProcessName = () => {
      void getDesktopForegroundProcessName()
        .then((processName) => {
          if (!cancelled) {
            setDetectedForegroundProcessName(processName);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDetectedForegroundProcessName(null);
          }
        });
    };

    syncForegroundProcessName();
    const intervalId = window.setInterval(
      syncForegroundProcessName,
      DESKTOP_GAME_OVERLAY_PROCESS_POLL_MS,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isDesktop, isMainWindowFocused, processDetectionEnabled]);

  useEffect(() => {
    if (!isDesktop || runtimeMetricRecordedRef.current) {
      return;
    }

    runtimeMetricRecordedRef.current = true;
    recordDesktopPerformanceMetric({
      operation: "desktop_runtime_ready",
      result: "success",
    });
    recordDesktopPerformanceMetric({
      durationMs: performance.now(),
      operation: "desktop_startup_duration",
      result: "success",
    });
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    if (!activeChannelId) {
      if (voiceJoinTimingRef.current) {
        recordDesktopPerformanceMetric({
          durationMs: performance.now() - voiceJoinTimingRef.current.startedAt,
          operation: "desktop_voice_join_timing",
          result: "failure",
        });
        voiceJoinTimingRef.current = null;
      }
      return;
    }

    if (connectionState === "connected") {
      if (voiceJoinTimingRef.current?.channelId === activeChannelId) {
        recordDesktopPerformanceMetric({
          durationMs: performance.now() - voiceJoinTimingRef.current.startedAt,
          operation: "desktop_voice_join_timing",
          result: "success",
        });
        voiceJoinTimingRef.current = null;
      }
      return;
    }

    if (voiceJoinTimingRef.current?.channelId !== activeChannelId) {
      voiceJoinTimingRef.current = {
        channelId: activeChannelId,
        startedAt: performance.now(),
      };
    }
  }, [activeChannelId, connectionState, isDesktop]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    void setDesktopActivityStatus(desktopActivityStatus, {
      locale,
      voiceActive: Boolean(activeChannelId) && connectionState === "connected",
      muted: isMuted,
      deafened: isDeafened,
    })
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
  }, [
    activeChannelId,
    connectionState,
    desktopActivityStatus,
    isDeafened,
    isDesktop,
    isMuted,
    locale,
  ]);

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
    const handleOnline = () => {
      setIsOnline(true);
      setSocketConnected(socket.connected);
      recordDesktopPerformanceMetric({
        operation: "desktop_network_transition",
        result: "success",
      });
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSocketConnected(false);
      recordDesktopPerformanceMetric({
        operation: "desktop_network_transition",
        result: "success",
      });
      void hideDesktopCompanionSurfaces("offline");
    };
    const syncSocketState = () => setSocketConnected(socket.connected);

    syncOnlineState();
    syncSocketState();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    socket.on("connect", syncSocketState);
    socket.on("connect_error", syncSocketState);
    socket.on("disconnect", syncSocketState);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      socket.off("connect", syncSocketState);
      socket.off("connect_error", syncSocketState);
      socket.off("disconnect", syncSocketState);
    };
  }, [hideDesktopCompanionSurfaces, isDesktop, queryClient, socket]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    let lastTickAt = Date.now();
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;

    const refreshAfterResume = (gapMs: number) => {
      recordDesktopPerformanceMetric({
        durationMs: gapMs,
        operation: "desktop_lifecycle_resume",
        result: "success",
      });
      setIsOnline(navigator.onLine);
      setSocketConnected(socket.connected);
      void hideDesktopCompanionSurfaces("resume");
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
    };

    const detectResumeGap = () => {
      const now = Date.now();
      const gapMs = now - lastTickAt;
      lastTickAt = now;

      if (gapMs >= DESKTOP_RESUME_GAP_MS) {
        refreshAfterResume(gapMs);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      const now = Date.now();
      const gapMs = hiddenAt ? now - hiddenAt : 0;
      hiddenAt = null;
      lastTickAt = now;

      if (gapMs >= DESKTOP_RESUME_GAP_MS) {
        refreshAfterResume(gapMs);
      }
    };

    const intervalId = window.setInterval(detectResumeGap, DESKTOP_RESUME_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", detectResumeGap);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", detectResumeGap);
    };
  }, [hideDesktopCompanionSurfaces, isDesktop, queryClient, socket]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    if (!isMainWindowFocused) {
      return;
    }

    void hideDesktopCompanionSurfaces("focus").catch(() => undefined);
  }, [hideDesktopCompanionSurfaces, isDesktop, isMainWindowFocused]);

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
      const operationId = ++overlayOperationIdRef.current;
      transitionGameOverlayState({
        type: shouldShowGameOverlay ? "show-requested" : "hide",
      });
      const visibilityTask = shouldShowGameOverlay
        ? repairDesktopGameOverlaySurface(desktopGameOverlayLayout)
        : hideDesktopGameOverlaySurface();

      void Promise.resolve(visibilityTask)
        .then(() => {
          if (overlayOperationIdRef.current !== operationId) {
            return;
          }
          if (shouldShowGameOverlay) {
            publishGameOverlaySnapshot();
          }
          transitionGameOverlayState({
            type: shouldShowGameOverlay ? "show-succeeded" : "hide",
          });
          recordDesktopPerformanceMetric({
            durationMs: performance.now() - startedAt,
            operation: "desktop_game_overlay_visible",
            result: "success",
          });
        })
        .catch(() => {
          if (overlayOperationIdRef.current === operationId) {
            gameOverlayVisibleRef.current = !shouldShowGameOverlay;
            transitionGameOverlayState({
              type: shouldShowGameOverlay ? "show-failed" : "hide",
            });
          }
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
    transitionGameOverlayState,
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
      void hideDesktopCompanionSurfaces("unmount").catch(() => undefined);
    },
    [hideDesktopCompanionSurfaces],
  );

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const handleDesktopBeforeClose = (event: Event) => {
      if (getWhisprDesktopBeforeCloseRequestId(event) === null) {
        return;
      }

      void hideDesktopCompanionSurfaces("before-close").catch(() => undefined);
    };

    window.addEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handleDesktopBeforeClose);
    return () => {
      window.removeEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handleDesktopBeforeClose);
    };
  }, [hideDesktopCompanionSurfaces, isDesktop]);

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
          } else if (overlayHealth === "ready" && shouldShowGameOverlay) {
            gameOverlayVisibleRef.current = true;
            transitionGameOverlayState({ type: "repair-succeeded" });
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
    const intervalId = window.setInterval(refreshSurfaces, DESKTOP_COMPANION_SURFACE_REFRESH_MS);

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
    transitionGameOverlayState,
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

      recordDesktopShortcutLatency(detail);

      switch (detail.command) {
        case "open-desktop-diagnostics":
          // Ş13 — eski `?section=&panel=` adresi 308 ile yönleniyor ama kabuk artık gerçek
          // yolu biliyor; bir yönlendirme turu daha atmasının nedeni yok. Tanılama bloğu
          // Masaüstü › Güncellemeler sekmesinde (`n3`).
          router.push(buildSettingsHref("updates"));
          break;
        case "open-settings":
          router.push(
            buildSettingsHref(DEFAULT_SETTINGS_ROUTE.section, DEFAULT_SETTINGS_ROUTE.tab),
          );
          break;
        case "hide-game-overlay":
          setDesktopGameOverlayEnabled(false);
          gameOverlayVisibleRef.current = false;
          overlayOperationIdRef.current += 1;
          transitionGameOverlayState({ type: "hide" });
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
        case "toggle-admin-console":
          // The window is the native side's state, so the shortcut asks what is
          // open before deciding which way to toggle.
          void getDesktopAdminConsoleOpen()
            .then((open) => setDesktopAdminConsoleVisible(!open))
            .catch(() => undefined);
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
    transitionGameOverlayState,
  ]);

  useEffect(() => {
    if (!isDesktop || typeof BroadcastChannel === "undefined") {
      return;
    }

    const channel = new BroadcastChannel(WHISPR_DESKTOP_VOICE_MINI_COMMAND_CHANNEL);
    const handleVoiceMiniCommand = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (!payload || typeof payload !== "object" || !("command" in payload)) {
        return;
      }

      const command = (payload as { command?: unknown }).command;
      if (!isDesktopVoiceMiniCommand(command)) {
        return;
      }

      switch (command) {
        case "leaveVoice":
          void leaveChannel();
          break;
        case "toggleDeafen":
          void toggleDeafen();
          break;
        case "toggleMute":
          void toggleMute();
          break;
      }
    };

    channel.addEventListener("message", handleVoiceMiniCommand);

    return () => {
      channel.removeEventListener("message", handleVoiceMiniCommand);
      channel.close();
    };
  }, [isDesktop, leaveChannel, toggleDeafen, toggleMute]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    applyAppBadge(effectiveDesktopStreamerModeEnabled ? 0 : (unreadQuery.data ?? 0));
  }, [effectiveDesktopStreamerModeEnabled, isDesktop, unreadQuery.data]);

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
        effectiveDesktopStreamerModeEnabled ||
        !desktopNotificationsEnabled ||
        document.visibilityState === "visible" ||
        !shouldDeliverDesktopNotification(
          payload.type,
          mentionSettingsQuery.data ?? MENTION_SETTINGS_DEFAULTS,
        )
      ) {
        return;
      }

      if (DESKTOP_NOTIFICATION_TYPES.has(payload.type)) {
        void sendNativeNotification(payload, desktopNotificationPreviews);
      }
    };

    const handleFriendsUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
    };

    // F9: the tray badge. The server counts the open cases and says so; this
    // hands the number to the native side untouched. Only admins who may read
    // the queue are in the room the event is sent to.
    const handleOpenCaseCount = ({ count }: { count: number }) => {
      void publishDesktopAdminCaseCount(count).catch(() => undefined);
    };
    socket.on("admin:open-case-count", handleOpenCaseCount);

    socket.on("notification:new", handleNotification);
    socket.on("friends:updated", handleFriendsUpdated);

    return () => {
      socket.off("notification:new", handleNotification);
      socket.off("friends:updated", handleFriendsUpdated);
      socket.off("admin:open-case-count", handleOpenCaseCount);
    };
  }, [
    desktopNotificationPreviews,
    desktopNotificationsEnabled,
    effectiveDesktopStreamerModeEnabled,
    isDesktop,
    mentionSettingsQuery.data,
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

      if (matchesAppShortcut("settings.open", event)) {
        event.preventDefault();
        router.push("/settings");
        return;
      }

      if (matchesAppShortcut("voice.toggleMute", event)) {
        event.preventDefault();
        void toggleMute();
        return;
      }

      if (matchesAppShortcut("voice.toggleDeafen", event)) {
        event.preventDefault();
        void toggleDeafen();
        return;
      }

      if (matchesAppShortcut("overlay.hide", event)) {
        event.preventDefault();
        setDesktopGameOverlayEnabled(false);
        gameOverlayVisibleRef.current = false;
        overlayOperationIdRef.current += 1;
        transitionGameOverlayState({ type: "hide" });
        void hideDesktopGameOverlaySurface().then(() => {
          recordDesktopPerformanceMetric({
            operation: "desktop_game_overlay_panic_disabled",
            result: "success",
          });
        });
        return;
      }

      if (matchesAppShortcut("navigation.back", event)) {
        event.preventDefault();
        router.back();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isDesktop,
    router,
    setDesktopGameOverlayEnabled,
    toggleDeafen,
    toggleMute,
    transitionGameOverlayState,
  ]);

  if (!isDesktop) {
    return null;
  }

  return <DesktopConnectionHealth isOnline={isOnline} socketConnected={socketConnected} t={t} />;
}
