"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

const COMPACT_NOTIFICATION_LIMIT = 6;
const NOTIFICATION_POPUP_WIDTH = 304;

function formatNotificationDate(locale: string, createdAt: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

type NotificationBellProps = {
  className?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
};

export function NotificationBell({
  className,
  onOpenChange,
  open: controlledOpen,
}: NotificationBellProps = {}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const { notificationAutoClose, notificationLimit, notificationPopupTimeoutSeconds } = useAppStore(
    useShallow((state) => ({
      notificationAutoClose: state.notificationAutoClose,
      notificationLimit: state.notificationLimit,
      notificationPopupTimeoutSeconds: state.notificationPopupTimeoutSeconds,
    })),
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const baseTitleRef = useRef<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{
    bottom: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const popupNotificationLimit = Math.min(notificationLimit, COMPACT_NOTIFICATION_LIMIT);
  const open = controlledOpen ?? uncontrolledOpen;
  const setPopoverOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const unreadQuery = useQuery({
    queryFn: fetchUnreadCount,
    queryKey: notificationsQueryKeys.unreadCount,
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    enabled: open,
    queryFn: () => fetchNotifications(popupNotificationLimit),
    queryKey: notificationsQueryKeys.list(popupNotificationLimit),
    staleTime: 30_000,
  });
  const unreadCount = unreadQuery.data ?? 0;
  const updateUnreadCount = useCallback(
    (update: (current: number) => number) => {
      queryClient.setQueryData<number>(notificationsQueryKeys.unreadCount, (current) =>
        Math.max(0, update(current ?? 0)),
      );
    },
    [queryClient],
  );

  const syncNotificationQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
    void queryClient.invalidateQueries({
      queryKey: notificationsQueryKeys.list(popupNotificationLimit),
    });
  }, [popupNotificationLimit, queryClient]);

  const prefetchNotifications = useCallback(() => {
    void queryClient.prefetchQuery({
      queryFn: () => fetchNotifications(popupNotificationLimit),
      queryKey: notificationsQueryKeys.list(popupNotificationLimit),
      staleTime: 30_000,
    });
  }, [popupNotificationLimit, queryClient]);

  const removeFriendRequestNotification = useCallback(
    (requestId: string) => {
      let removedUnreadCount = 0;

      queryClient.setQueryData<NotificationDTO[] | undefined>(
        notificationsQueryKeys.list(popupNotificationLimit),
        (current) => {
          if (!current) {
            return current;
          }

          return current.filter((notification) => {
            const matches =
              notification.type === "FRIEND_REQUEST" &&
              notification.meta?.friendRequestId === requestId;

            if (matches && !notification.readAt) {
              removedUnreadCount += 1;
            }

            return !matches;
          });
        },
      );

      if (removedUnreadCount > 0) {
        updateUnreadCount((current) => current - removedUnreadCount);
      }

      syncNotificationQueries();
    },
    [popupNotificationLimit, queryClient, syncNotificationQueries, updateUnreadCount],
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const handleChange = () => setIsMobileViewport(query.matches);

    handleChange();
    query.addEventListener("change", handleChange);

    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    baseTitleRef.current ??= document.title.replace(/^\(\d+\+?\)\s*/, "") || "Whispr";
    const baseTitle = baseTitleRef.current;
    document.title =
      unreadCount > 0 ? `(${unreadCount > 99 ? "99+" : unreadCount}) ${baseTitle}` : baseTitle;

    return () => {
      document.title = baseTitle;
    };
  }, [unreadCount]);

  useEffect(() => {
    const handleIncomingNotification = () => {
      updateUnreadCount((current) => current + 1);
      syncNotificationQueries();
    };

    const handleFriendsUpdated = () => {
      syncNotificationQueries();
    };

    socket.on("notification:new", handleIncomingNotification);
    socket.on("friends:updated", handleFriendsUpdated);

    return () => {
      socket.off("notification:new", handleIncomingNotification);
      socket.off("friends:updated", handleFriendsUpdated);
    };
  }, [socket, syncNotificationQueries, updateUnreadCount]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setPopoverOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopoverOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, setPopoverOpen]);

  useEffect(() => {
    if (!open || !notificationAutoClose) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPopoverOpen(false);
    }, notificationPopupTimeoutSeconds * 1000);

    return () => window.clearTimeout(timeout);
  }, [notificationAutoClose, notificationPopupTimeoutSeconds, open, setPopoverOpen]);

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      const previousCount = unreadCount;
      updateUnreadCount(() => 0);
      return { previousCount };
    },
    onError: (_error, _variables, context) => {
      updateUnreadCount(() => context?.previousCount ?? 0);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.list(popupNotificationLimit),
      });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: deleteAllNotifications,
    onMutate: () => {
      const previousCount = unreadCount;
      updateUnreadCount(() => 0);
      return { previousCount };
    },
    onError: (_error, _variables, context) => {
      updateUnreadCount(() => context?.previousCount ?? 0);
    },
    onSuccess: async () => {
      setPopoverOpen(false);
      setDropdownPos(null);
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
      await queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.list(popupNotificationLimit),
      });
    },
  });

  const list = listQuery.data ?? [];
  const unreadSummaryLabel = useMemo(
    () => t("notifications.bell.unreadSummary", { count: unreadCount }),
    [t, unreadCount],
  );

  const closePopover = () => {
    setPopoverOpen(false);
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

    if (isMobileViewport) {
      setDropdownPos({ bottom: 0, left: 0, maxHeight: window.innerHeight });
      setPopoverOpen(true);
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const controlsRoot = buttonRef.current.closest<HTMLElement>(
      "[data-notification-popup-anchor='controls-border']",
    );
    const userBarAnchor = buttonRef.current.closest<HTMLElement>("[data-user-bar-anchor='true']");
    const sidebarRoot = buttonRef.current.closest<HTMLElement>(".app-sidebar");
    const anchorElement =
      userBarAnchor ??
      controlsRoot ??
      sidebarRoot?.querySelector<HTMLElement>(
        "[data-notification-popup-anchor='controls-border']",
      ) ??
      sidebarRoot?.querySelector<HTMLElement>("[data-notification-popup-anchor='voice']") ??
      sidebarRoot?.querySelector<HTMLElement>("[data-notification-popup-anchor='user']");
    const userBarRect = anchorElement?.getBoundingClientRect() ?? rect;
    const minMargin = 12;
    const popupWidth = Math.min(NOTIFICATION_POPUP_WIDTH, window.innerWidth - minMargin * 2);
    const gapFromBar = 6;
    const bottom = Math.max(minMargin, window.innerHeight - userBarRect.top + gapFromBar);
    const maxHeight = Math.max(260, userBarRect.top - gapFromBar - minMargin);

    let left = userBarRect.right - popupWidth;
    left = Math.max(minMargin, Math.min(left, window.innerWidth - popupWidth - minMargin));

    setDropdownPos({ bottom, left, maxHeight });
    setPopoverOpen(true);
  };

  const handleReadAndNavigate = async (notification: NotificationDTO) => {
    if (!notification.readAt) {
      await markNotificationRead(notification.id);
      updateUnreadCount((current) => current - 1);
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.unreadCount });
      void queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.list(popupNotificationLimit),
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
        className={cn(
          "relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-[hsl(var(--foreground)/0.7)] transition hover:bg-[hsl(var(--surface-soft)/0.42)] hover:text-[hsl(var(--foreground))] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          className,
        )}
        data-testid="notification-bell-button"
        onFocus={prefetchNotifications}
        onMouseEnter={prefetchNotifications}
        onClick={handleToggle}
        type="button"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 inline-flex min-w-[1.4rem] items-center justify-center rounded-full border border-[hsl(var(--surface-card))] bg-[hsl(var(--danger))] px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--danger-foreground))] shadow-[0_10px_22px_hsl(var(--shadow-color)/0.18)]"
            data-testid="notification-bell-badge"
          >
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
                  className={cn(
                    "fixed z-[80] overflow-hidden border border-[hsl(var(--border)/0.66)] bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.98),hsl(var(--surface-soft)/0.9))] shadow-[0_18px_46px_hsl(var(--shadow-color)/0.14)] backdrop-blur-xl",
                    isMobileViewport
                      ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-h-[min(28rem,calc(100dvh-1.5rem))] rounded-[22px]"
                      : "w-[min(19rem,calc(100vw-1.25rem))] rounded-[22px]",
                  )}
                  aria-label={t("notifications.bell.title")}
                  data-notification-popup="true"
                  data-testid="notification-popup"
                  exit={{ opacity: 0, scale: 0.97, y: -10 }}
                  initial={{ opacity: 0, scale: 0.97, y: -10 }}
                  role="dialog"
                  style={
                    isMobileViewport
                      ? {}
                      : {
                          bottom: `${dropdownPos.bottom}px`,
                          left: `${dropdownPos.left}px`,
                          maxHeight: `${dropdownPos.maxHeight}px`,
                        }
                  }
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="border-b border-[hsl(var(--border)/0.58)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.94),hsl(var(--primary)/0.08))] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl border border-[hsl(var(--primary)/0.16)] bg-[hsl(var(--primary)/0.09)] text-[hsl(var(--primary))]">
                          <Sparkles className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-app-foreground">
                            {t("notifications.bell.title")}
                          </h3>
                          <p className="mt-0.5 truncate text-[11px] text-app-muted">
                            {unreadSummaryLabel}
                          </p>
                        </div>
                      </div>
                      {unreadCount > 0 ? (
                        <button
                          className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary))] px-2.5 text-[11px] font-semibold text-[hsl(var(--primary-foreground))] shadow-[0_10px_20px_hsl(var(--primary)/0.18)] transition hover:brightness-[1.03] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-50"
                          disabled={markAllMutation.isPending}
                          onClick={() => markAllMutation.mutate()}
                          type="button"
                        >
                          <CheckCheck className="h-3 w-3" />
                          {t("notifications.bell.markAllRead")}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="max-h-[min(16rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain p-2 [scrollbar-width:none] sm:max-h-[22rem] [&::-webkit-scrollbar]:hidden">
                    {listQuery.isLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            className="rounded-[18px] bg-[hsl(var(--surface-card)/0.5)] p-2.5"
                            key={index}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 animate-pulse rounded-full bg-[hsl(var(--surface-soft))]" />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="h-2.5 w-20 animate-pulse rounded-full bg-[hsl(var(--surface-soft))]" />
                                <div className="h-3 w-32 animate-pulse rounded-full bg-[hsl(var(--surface-soft)/0.85)]" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : list.length === 0 ? (
                      <div className="flex min-h-[168px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.48)] px-4 text-center">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[hsl(var(--surface-soft)/0.7)]">
                          <Inbox className="h-4 w-4 text-app-muted" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-app-foreground">
                          {t("notifications.bell.empty")}
                        </p>
                        <p className="mt-1.5 text-xs leading-5 text-app-muted">
                          {t("notifications.bell.emptyDescription")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {list.map((notification) => (
                          <NotificationItem
                            key={notification.id}
                            locale={locale}
                            notification={notification}
                            onClose={closePopover}
                            onDismissFriendRequest={removeFriendRequestNotification}
                            onReadAndNavigate={handleReadAndNavigate}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {list.length > 0 ? (
                    <div className="border-t border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.78)] px-2.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          className="min-h-9 flex-1 rounded-xl border border-[hsl(var(--border)/0.68)] px-3 text-xs font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.46)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                          onClick={() => {
                            closePopover();
                            router.push("/channels/@me");
                          }}
                          type="button"
                        >
                          {t("notifications.bell.seeAll")}
                        </button>
                        <button
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.1)] px-2.5 text-xs font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.16)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] disabled:opacity-50"
                          disabled={clearAllMutation.isPending}
                          onClick={() => clearAllMutation.mutate()}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
  onDismissFriendRequest,
  onReadAndNavigate,
}: {
  locale: string;
  notification: NotificationDTO;
  onClose: () => void;
  onDismissFriendRequest: (requestId: string) => void;
  onReadAndNavigate: (notification: NotificationDTO) => Promise<void>;
}) {
  const { t } = useI18n();
  const [isReading, setIsReading] = useState(false);
  const actorName =
    notification.actor?.displayName ||
    notification.actor?.username ||
    t("notifications.actor.system");
  const actorUsername = notification.actor?.username ?? "system";
  const actorAvatarUrl = notification.actor?.avatarUrl ?? null;

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
      className={`w-full rounded-[18px] border px-2.5 py-2 transition ${
        notification.readAt
          ? "border-transparent bg-transparent opacity-80 hover:border-[hsl(var(--border)/0.42)] hover:bg-[hsl(var(--surface-card)/0.52)]"
          : "border-[hsl(var(--primary)/0.2)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.1),hsl(var(--surface-card)/0.82))] shadow-[0_10px_24px_hsl(var(--shadow-color)/0.06)] hover:bg-[linear-gradient(135deg,hsl(var(--primary)/0.13),hsl(var(--surface-card)/0.92))]"
      }`}
      data-testid="notification-item"
    >
      <button
        className="w-full text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
        onClick={handleClick}
        type="button"
      >
        <div className="flex items-start gap-2.5">
          <Avatar
            alt={actorName}
            className="h-8 w-8 shrink-0 text-xs"
            fallback={actorName}
            src={actorAvatarUrl}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-app-muted">
                  {actorName}
                  <span className="ml-1 text-app-soft">@{actorUsername}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-app-foreground [overflow-wrap:anywhere]">
                  {notification.message}
                </p>
              </div>
              {!notification.readAt ? (
                <Badge
                  className="shrink-0 border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary))] px-1.5 py-0 text-[10px] text-[hsl(var(--primary-foreground))]"
                  tone="danger"
                >
                  {t("notifications.bell.new")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-app-soft">
              <span>{formatNotificationDate(locale, notification.createdAt)}</span>
              {isReading && !notification.readAt ? (
                <>
                  <span>/</span>
                  <span>...</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      {notification.type === "FRIEND_REQUEST" && notification.meta?.friendRequestId ? (
        <div className="mt-2 border-t border-[hsl(var(--border)/0.48)] pt-2">
          <FriendRequestActions
            onHandled={onDismissFriendRequest}
            requestId={notification.meta.friendRequestId}
          />
        </div>
      ) : null}
    </div>
  );
}

function FriendRequestActions({
  onHandled,
  requestId,
}: {
  onHandled: (requestId: string) => void;
  requestId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "accept"),
    onSuccess: async () => {
      onHandled(requestId);
      await queryClient.invalidateQueries({ queryKey: ["friends", "pending"] });
      await queryClient.invalidateQueries({ queryKey: ["friends", "list"] });
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "decline"),
    onSuccess: async () => {
      onHandled(requestId);
      await queryClient.invalidateQueries({ queryKey: ["friends", "pending"] });
      await queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.root });
    },
  });

  return (
    <div className="flex gap-2">
      <button
        className="min-h-8 flex-1 rounded-xl bg-[hsl(var(--primary))] px-2.5 text-[11px] font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-50"
        disabled={acceptMutation.isPending || declineMutation.isPending}
        onClick={() => acceptMutation.mutate()}
        type="button"
      >
        {t("notifications.actions.accept")}
      </button>
      <button
        className="min-h-8 flex-1 rounded-xl border border-[hsl(var(--border)/0.66)] px-2.5 text-[11px] font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.46)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-50"
        disabled={acceptMutation.isPending || declineMutation.isPending}
        onClick={() => declineMutation.mutate()}
        type="button"
      >
        {t("notifications.actions.decline")}
      </button>
    </div>
  );
}
