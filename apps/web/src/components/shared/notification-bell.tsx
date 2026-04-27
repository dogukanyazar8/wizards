"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { Bell } from "lucide-react";
import { useSocket } from "@/hooks/use-socket";
import { useI18n } from "@/components/providers/locale-provider";
import { useAppStore } from "@/lib/store";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteAllNotifications,
  notificationsQueryKeys,
} from "@/lib/notifications/client";
import { actOnFriendRequestRequest } from "@/lib/friends/client";
import type { NotificationDTO } from "@/lib/notifications/types";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";

export function NotificationBell() {
  const { t } = useI18n();
  const router = useRouter();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { notificationAutoClose, notificationLimit } = useAppStore(
    useShallow((state) => ({
      notificationAutoClose: state.notificationAutoClose,
      notificationLimit: state.notificationLimit,
    })),
  );

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const unreadQuery = useQuery({
    queryKey: notificationsQueryKeys.unreadCount,
    queryFn: fetchUnreadCount,
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    queryKey: notificationsQueryKeys.list(notificationLimit),
    queryFn: () => fetchNotifications(notificationLimit),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    setUnreadCount(unreadQuery.data ?? 0);
  }, [unreadQuery.data]);

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      const prev = unreadCount;
      setUnreadCount(0);
      return { prev };
    },
    onError: (_, __, ctx) => {
      setUnreadCount(ctx!.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.list(notificationLimit) });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: deleteAllNotifications,
    onMutate: () => {
      const prev = unreadCount;
      setUnreadCount(0);
      return { prev };
    },
    onError: (_, __, ctx) => {
      setUnreadCount(ctx!.prev);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.list(notificationLimit) });
      setOpen(false);
    },
  });

  const handleOpen = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    let top = rect.bottom + 8;
    const right = window.innerWidth - rect.right;

    if (rect.bottom + 320 > window.innerHeight) {
      top = window.innerHeight - rect.top - 8;
    }

    setDropdownPos({ top, right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open || !notificationAutoClose) return;

    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open, notificationAutoClose]);

  useEffect(() => {
    socket.on("notification:new", () => {
      setUnreadCount((prev) => prev + 1);
      queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.list(notificationLimit) });
    });

    return () => {
      socket.off("notification:new");
    };
  }, [socket, queryClient, notificationLimit]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-[hsl(var(--foreground)/0.7)] transition hover:text-[hsl(var(--foreground))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        aria-label={t("notifications.bell.title")}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(var(--destructive))] text-xs font-semibold text-[hsl(var(--destructive-foreground))]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {dropdownPos &&
        createPortal(
          <motion.div
            ref={popoverRef}
            className="fixed z-[60] w-80 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-xl"
            style={{ top: `${dropdownPos.top}px`, right: `${dropdownPos.right}px` }}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-4">
              <h3 className="font-semibold text-[hsl(var(--foreground))]">{t("notifications.bell.title")}</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  className="text-xs text-[hsl(var(--primary))] hover:underline disabled:opacity-50"
                >
                  {t("notifications.bell.markAllRead")}
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto bg-[hsl(var(--background))]">
              {listQuery.isLoading ? (
                <div className="p-4 text-center text-sm text-[hsl(var(--foreground)/0.6)]">
                  Loading...
                </div>
              ) : !listQuery.data || listQuery.data.length === 0 ? (
                <div className="p-4 text-center text-sm text-[hsl(var(--foreground)/0.6)]">
                  {t("notifications.bell.empty")}
                </div>
              ) : (
                <div className="divide-y divide-[hsl(var(--border))]">
                  {listQuery.data.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onRead={(id) => markNotificationRead(id)}
                      onNavigate={(url) => router.push(url)}
                    />
                  ))}
                </div>
              )}
            </div>

            {listQuery.data && listQuery.data.length > 0 && (
              <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    router.push("/channels/@me");
                    setOpen(false);
                  }}
                  className="flex-1 text-xs text-[hsl(var(--primary))] hover:underline"
                >
                  {t("notifications.bell.seeAll")}
                </button>
                <button
                  onClick={() => clearAllMutation.mutate()}
                  disabled={clearAllMutation.isPending}
                  className="flex-1 rounded border border-[hsl(var(--border))] px-2 py-1.5 text-xs font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--surface-hover))] disabled:opacity-50"
                >
                  {clearAllMutation.isPending ? "..." : t("notifications.bell.clearAll")}
                </button>
              </div>
            )}
          </motion.div>,
          document.body,
        )}
    </>
  );
}

function NotificationItem({
  notification,
  onRead,
  onNavigate,
}: {
  notification: NotificationDTO;
  onRead: (id: string) => Promise<void>;
  onNavigate: (url: string) => void;
}) {
  const [isReading, setIsReading] = useState(false);

  const handleClick = async () => {
    setIsReading(true);
    try {
      await onRead(notification.id);
      if (notification.actionUrl) {
        onNavigate(notification.actionUrl);
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    } finally {
      setIsReading(false);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`flex cursor-pointer gap-3 border-l-4 p-3 transition ${
        notification.readAt
          ? "border-transparent bg-[hsl(var(--background))] opacity-60"
          : "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)] hover:bg-[hsl(var(--primary)/0.12)]"
      }`}
    >
      <Avatar
        src={notification.actor.avatarUrl}
        alt={notification.actor.displayName || notification.actor.username}
        className="h-10 w-10 flex-shrink-0"
        fallback={(notification.actor.displayName || notification.actor.username)[0] || "?"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[hsl(var(--foreground)/0.8)]">
              {notification.actor.displayName || notification.actor.username}
            </p>
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              {notification.message}
            </p>
          </div>
        </div>
        <p className="text-xs text-[hsl(var(--foreground)/0.5)] mt-1">
          {new Date(notification.createdAt).toLocaleString()}
        </p>
        {notification.type === "FRIEND_REQUEST" && notification.meta?.friendRequestId && (
          <FriendRequestActions requestId={notification.meta.friendRequestId} />
        )}
      </div>
      {isReading && <div className="animate-pulse" />}
    </div>
  );
}

function FriendRequestActions({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "accept"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["friends", "list"] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "decline"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends", "pending"] });
    },
  });

  return (
    <div className="mt-2 flex gap-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          acceptMutation.mutate();
        }}
        disabled={acceptMutation.isPending || declineMutation.isPending}
        className="flex-1 rounded bg-[hsl(var(--primary))] px-2 py-1 text-xs font-medium text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
      >
        {t("notifications.actions.accept")}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          declineMutation.mutate();
        }}
        disabled={acceptMutation.isPending || declineMutation.isPending}
        className="flex-1 rounded border border-[hsl(var(--border))] px-2 py-1 text-xs font-medium transition hover:bg-[hsl(var(--surface-hover))] disabled:opacity-50"
      >
        {t("notifications.actions.decline")}
      </button>
    </div>
  );
}
