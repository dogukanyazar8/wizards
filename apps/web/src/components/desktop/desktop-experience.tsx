"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";
import {
  fetchUnreadCount,
  notificationsQueryKeys,
} from "@/lib/notifications/client";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import { fetchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import {
  WHISPR_DESKTOP_COMMAND_EVENT,
  isSafeDesktopInternalPath,
  isWhisprDesktopRuntime,
  type WhisprDesktopCommandDetail,
} from "@/lib/desktop/runtime";
import { useAppStore } from "@/lib/store";
import { useVoiceState } from "@/components/providers/voice-provider";
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

async function sendNativeNotification(
  payload: NotificationSocketPayload,
  showPreviews: boolean,
) {
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

  const title = isOnline
    ? t("desktop.health.socket.title")
    : t("desktop.health.offline.title");
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
  const { toggleDeafen, toggleMute } = useVoiceState();
  const { t } = useI18n();
  const desktopNotificationPreviews = useAppStore(
    (state) => state.desktopNotificationPreviews,
  );
  const [isDesktop, setIsDesktop] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

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

  useEffect(() => {
    setIsDesktop(isWhisprDesktopRuntime());
  }, []);

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
          router.push("/settings?section=about&panel=desktop");
          break;
        case "open-settings":
          router.push("/settings");
          break;
        case "toggle-deafen":
          void toggleDeafen();
          break;
        case "toggle-mute":
          void toggleMute();
          break;
      }
    };

    window.addEventListener(WHISPR_DESKTOP_COMMAND_EVENT, handleDesktopCommand);

    return () => {
      window.removeEventListener(WHISPR_DESKTOP_COMMAND_EVENT, handleDesktopCommand);
    };
  }, [isDesktop, router, toggleDeafen, toggleMute]);

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

    applyAppBadge(unreadQuery.data ?? 0);
  }, [isDesktop, unreadQuery.data]);

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

      if (!desktopNotificationsEnabled || document.visibilityState === "visible") {
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
  }, [isDesktop, router, toggleDeafen, toggleMute]);

  if (!isDesktop) {
    return null;
  }

  return (
    <DesktopConnectionHealth
      isOnline={isOnline}
      socketConnected={socketConnected}
      t={t}
    />
  );
}
