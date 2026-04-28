"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, Inbox, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/hooks/use-socket";
import { useI18n } from "@/components/providers/locale-provider";
import { useAppStore } from "@/lib/store";
import { actOnFriendRequestRequest } from "@/lib/friends/client";
import {
  deleteAllNotifications,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueryKeys,
} from "@/lib/notifications/client";
import type { NotificationDTO } from "@/lib/notifications/types";

function formatNotificationDate(locale: string, createdAt: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

export function NotificationBell() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const {
    notificationAutoClose,
    notificationLimit,
    notificationPopupTimeoutSeconds,
  } = useAppStore(
    useShallow((state) => ({
      notificationAutoClose: state.notificationAutoClose,
      notificationLimit: state.notificationLimit,
      notificationPopupTimeoutSeconds: state.notificationPopupTimeoutSeconds,
    })),
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number } | null>(null);

  const unreadQuery = useQuery({
    queryFn: fetchUnreadCount,
    queryKey: notificationsQueryKeys.unreadCount,
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    enabled: open,
    queryFn: () => fetchNotifications(notificationLimit),
    queryKey: notificationsQueryKeys.list(notificationLimit),
    staleTime: 30_000,
  });

  useEffect(() => {
    setUnreadCount(unreadQuery.data ?? 0);
  }, [unreadQuery.data]);

  useEffect(() => {
    const handleIncomingNotification = () => {
      setUnreadCount((current) => current + 1);
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
      void queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.list(notificationLimit),
      });
    };

    socket.on("notification:new", handleIncomingNotification);

    return () => {
      socket.off("notification:new", handleIncomingNotification);
    };
  }, [notificationLimit, queryClient, socket]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !notificationAutoClose) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setOpen(false);
    }, notificationPopupTimeoutSeconds * 1000);

    return () => window.clearTimeout(timeout);
  }, [notificationAutoClose, notificationPopupTimeoutSeconds, open]);

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      const previousCount = unreadCount;
      setUnreadCount(0);
      return { previousCount };
    },
    onError: (_error, _variables, context) => {
      setUnreadCount(context?.previousCount ?? 0);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.list(notificationLimit),
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: deleteAllNotifications,
    onMutate: () => {
      const previousCount = unreadCount;
      setUnreadCount(0);
      return { previousCount };
    },
    onError: (_error, _variables, context) => {
      setUnreadCount(context?.previousCount ?? 0);
    },
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.list(notificationLimit),
      });
    },
  });

  const list = listQuery.data ?? [];
  const unreadSummaryLabel = useMemo(
    () => t("notifications.bell.unreadSummary", { count: unreadCount }),
    [t, unreadCount],
  );

  const closePopover = () => {
    setOpen(false);
    setDropdownPos(null);
  };

  const handleToggle = () => {
    if (open) {
      closePopover();
      return;
    }

    if (!buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const userBarRect =
      buttonRef.current
        .closest<HTMLElement>("[data-user-bar-anchor='true']")
        ?.getBoundingClientRect() ?? rect;
    const minMargin = 16;
    const popupWidth = Math.min(384, window.innerWidth - minMargin * 2);
    const estimatedPopupHeight = 520;
    const gapFromBar = 12;

    let top = userBarRect.top - estimatedPopupHeight - gapFromBar;
    let positionedBelow = false;

    if (top < minMargin) {
      top = userBarRect.bottom + gapFromBar;
      positionedBelow = true;
    }

    if (top + estimatedPopupHeight > window.innerHeight - minMargin) {
      if (!positionedBelow) {
        const belowPosition = userBarRect.bottom + gapFromBar;
        if (belowPosition + estimatedPopupHeight <= window.innerHeight - minMargin) {
          top = belowPosition;
        } else {
          top = Math.max(minMargin, window.innerHeight - estimatedPopupHeight - minMargin);
        }
      } else {
        top = Math.max(minMargin, window.innerHeight - estimatedPopupHeight - minMargin);
      }
    }

    let left = userBarRect.left - 6;
    left = Math.max(minMargin, Math.min(left, window.innerWidth - popupWidth - minMargin));

    setDropdownPos({ top, left });
    setOpen(true);
  };

  const handleReadAndNavigate = async (notification: NotificationDTO) => {
    if (!notification.readAt) {
      await markNotificationRead(notification.id);
      setUnreadCount((current) => Math.max(0, current - 1));
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
      void queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.list(notificationLimit),
      });
    }

    if (notification.actionUrl) {
      closePopover();
      router.push(notification.actionUrl);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        aria-label={t("notifications.bell.title")}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-[hsl(var(--foreground)/0.7)] transition hover:bg-[hsl(var(--surface-soft)/0.42)] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        onClick={handleToggle}
        type="button"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.4rem] items-center justify-center rounded-full border border-[hsl(var(--surface-card))] bg-[hsl(var(--danger))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--danger-foreground))] shadow-[0_10px_22px_hsl(var(--shadow-color)/0.18)]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {typeof document !== "undefined" && dropdownPos
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={popoverRef}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="fixed z-[80] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[28px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.96),hsl(var(--surface-soft)/0.8))] shadow-[0_26px_70px_hsl(var(--shadow-color)/0.18)] backdrop-blur-xl"
                  data-notification-popup="true"
                  exit={{ opacity: 0, scale: 0.97, y: -10 }}
                  initial={{ opacity: 0, scale: 0.97, y: -10 }}
                  style={{ left: `${dropdownPos.left}px`, top: `${dropdownPos.top}px` }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="border-b border-[hsl(var(--border)/0.72)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.92),hsl(var(--primary)/0.12))] px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="app-panel-soft flex h-10 w-10 items-center justify-center rounded-2xl border">
                            <Sparkles className="h-4 w-4 text-app-foreground" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-app-foreground">
                              {t("notifications.bell.title")}
                            </h3>
                            <p className="mt-1 text-xs text-app-muted">{unreadSummaryLabel}</p>
                          </div>
                        </div>
                      </div>
                      {unreadCount > 0 ? <Badge>{unreadCount}</Badge> : null}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface-soft)/0.52)] px-3 py-1.5 text-[11px] font-medium text-app-muted">
                        <Inbox className="h-3.5 w-3.5" />
                        {t("notifications.bell.liveUpdates")}
                      </span>
                      {unreadCount > 0 ? (
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.12)] px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--primary))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-50"
                          disabled={markAllMutation.isPending}
                          onClick={() => markAllMutation.mutate()}
                          type="button"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          {t("notifications.bell.markAllRead")}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="max-h-[28rem] overflow-y-auto p-3">
                    {listQuery.isLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div className="app-panel rounded-[24px] border p-4" key={index}>
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 animate-pulse rounded-full bg-[hsl(var(--surface-soft))]" />
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="h-3 w-24 animate-pulse rounded-full bg-[hsl(var(--surface-soft))]" />
                                <div className="h-4 w-40 animate-pulse rounded-full bg-[hsl(var(--surface-soft)/0.85)]" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : list.length === 0 ? (
                      <div className="app-panel flex min-h-[260px] flex-col items-center justify-center rounded-[26px] border border-dashed border-[hsl(var(--border)/0.7)] px-6 text-center">
                        <div className="app-panel-soft flex h-14 w-14 items-center justify-center rounded-[22px] border">
                          <Inbox className="h-5 w-5 text-app-muted" />
                        </div>
                        <p className="mt-4 text-sm font-semibold text-app-foreground">
                          {t("notifications.bell.empty")}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-app-muted">
                          {t("notifications.bell.emptyDescription")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {list.map((notification) => (
                          <NotificationItem
                            key={notification.id}
                            locale={locale}
                            notification={notification}
                            onClose={closePopover}
                            onReadAndNavigate={handleReadAndNavigate}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {list.length > 0 ? (
                    <div className="border-t border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.72)] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          className="flex-1 rounded-2xl border border-[hsl(var(--border)/0.78)] px-3 py-2 text-sm font-medium text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.46)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                          onClick={() => {
                            closePopover();
                            router.push("/channels/@me");
                          }}
                          type="button"
                        >
                          {t("notifications.bell.seeAll")}
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.2)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-sm font-medium text-[hsl(var(--danger-foreground))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] disabled:opacity-50"
                          disabled={clearAllMutation.isPending}
                          onClick={() => clearAllMutation.mutate()}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("notifications.bell.clearAll")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

function NotificationItem({
  locale,
  notification,
  onClose,
  onReadAndNavigate,
}: {
  locale: string;
  notification: NotificationDTO;
  onClose: () => void;
  onReadAndNavigate: (notification: NotificationDTO) => Promise<void>;
}) {
  const { t } = useI18n();
  const [isReading, setIsReading] = useState(false);
  const actorName = notification.actor.displayName || notification.actor.username;

  const handleClick = async () => {
    setIsReading(true);
    try {
      await onReadAndNavigate(notification);
      if (!notification.actionUrl) {
        onClose();
      }
    } finally {
      setIsReading(false);
    }
  };

  return (
    <div
      className={`app-panel w-full rounded-[24px] border p-4 transition ${
        notification.readAt
          ? "border-[hsl(var(--border)/0.62)] opacity-80 hover:bg-[hsl(var(--surface-soft)/0.28)]"
          : "border-[hsl(var(--primary)/0.28)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.12),hsl(var(--surface-card)/0.92))] shadow-[0_16px_34px_hsl(var(--shadow-color)/0.08)] hover:opacity-95"
      }`}
    >
      <button
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={handleClick}
        type="button"
      >
        <div className="flex items-start gap-3">
          <Avatar
            alt={actorName}
            className="h-11 w-11 shrink-0 text-sm"
            fallback={actorName}
            src={notification.actor.avatarUrl}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-app-soft">
                  @{notification.actor.username}
                </p>
                <p className="mt-2 text-sm font-semibold text-app-foreground">
                  {notification.message}
                </p>
              </div>
              {!notification.readAt ? (
                <Badge tone="danger">{t("notifications.bell.new")}</Badge>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-app-muted">
              <span>{actorName}</span>
              <span className="text-app-soft">/</span>
              <span>{formatNotificationDate(locale, notification.createdAt)}</span>
              {isReading && !notification.readAt ? (
                <>
                  <span className="text-app-soft">/</span>
                  <span>...</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      {notification.type === "FRIEND_REQUEST" && notification.meta?.friendRequestId ? (
        <div className="mt-4 border-t border-[hsl(var(--border)/0.62)] pt-4">
          <FriendRequestActions requestId={notification.meta.friendRequestId} />
        </div>
      ) : null}
    </div>
  );
}

function FriendRequestActions({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "accept"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["friends", "pending"] });
      await queryClient.invalidateQueries({ queryKey: ["friends", "list"] });
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "decline"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["friends", "pending"] });
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
    },
  });

  return (
    <div className="flex gap-2">
      <button
        className="flex-1 rounded-2xl bg-[hsl(var(--primary))] px-3 py-2 text-xs font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
        disabled={acceptMutation.isPending || declineMutation.isPending}
        onClick={() => acceptMutation.mutate()}
        type="button"
      >
        {t("notifications.actions.accept")}
      </button>
      <button
        className="flex-1 rounded-2xl border border-[hsl(var(--border)/0.78)] px-3 py-2 text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.46)] disabled:opacity-50"
        disabled={acceptMutation.isPending || declineMutation.isPending}
        onClick={() => declineMutation.mutate()}
        type="button"
      >
        {t("notifications.actions.decline")}
      </button>
    </div>
  );
}
