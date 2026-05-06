"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSocket } from "@/hooks/use-socket";
import {
  fetchUnreadCount,
  notificationsQueryKeys,
} from "@/lib/notifications/client";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import { fetchLayoutSettings, settingsQueryKeys } from "@/lib/settings/client";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { useVoiceConnection } from "@/components/providers/voice-provider";

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

function isSafeInternalPath(value: string | null): value is string {
  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\"),
  );
}

function getNotificationBody(type: NotificationSocketPayload["type"]) {
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

async function sendNativeNotification(payload: NotificationSocketPayload) {
  const api = await getNotificationApi();

  if (!api || !(await api.isPermissionGranted().catch(() => false))) {
    return false;
  }

  api.sendNotification({
    body: getNotificationBody(payload.type),
    title: "Whispr",
  });

  return true;
}

function sendWebNotificationFallback(
  payload: NotificationSocketPayload,
  onNavigate: (path: string) => void,
) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification("Whispr", {
    body: getNotificationBody(payload.type),
    icon: "/app-icons/whispr.png",
    tag: payload.id,
  });

  notification.onclick = () => {
    window.focus();
    const actionUrl = payload.actionUrl;
    if (isSafeInternalPath(actionUrl)) {
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

export function DesktopExperience() {
  const router = useRouter();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const voice = useVoiceConnection();
  const isDesktop = useMemo(isWhisprDesktopRuntime, []);

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
        void sendNativeNotification(payload).then((sent) => {
          if (!sent) {
            sendWebNotificationFallback(payload, (path) => router.push(path));
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
  }, [desktopNotificationsEnabled, isDesktop, queryClient, router, socket]);

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
        void voice.toggleMute();
        return;
      }

      if (commandOrControl && event.shiftKey && !event.altKey && key === "d") {
        event.preventDefault();
        void voice.toggleDeafen();
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
  }, [isDesktop, router, voice]);

  return null;
}
