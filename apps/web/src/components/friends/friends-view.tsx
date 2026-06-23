"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquareMore,
  RefreshCw,
  SendHorizontal,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/components/providers/locale-provider";
import { FriendCard } from "@/components/friends/friend-card";
import { useSocket } from "@/hooks/use-socket";
import {
  createDMConversationRequest,
  type DMConversationsInfiniteData,
  dmQueryKeys,
  upsertDMConversationPageData,
} from "@/lib/dm/client";
import {
  actOnFriendRequestRequest,
  applyFriendPresenceUpdate,
  blockFriendRequest,
  cancelFriendRequestRequest,
  fetchBlockedFriends,
  fetchFriends,
  fetchPendingFriends,
  FriendsClientError,
  friendsQueryKeys,
  removeFriendRequest,
  sendFriendRequestRequest,
  unblockFriendRequest,
} from "@/lib/friends/client";
import type {
  FriendDto,
  FriendErrorCode,
  FriendRequestDto,
  PendingFriendsResponse,
} from "@/lib/friends/types";

type FriendsTabId = "online" | "all" | "pending" | "add" | "blocked";

type ConfirmState =
  | { friend: FriendDto; type: "block" }
  | { friend: FriendDto; type: "remove" }
  | null;

const EMPTY_PENDING: PendingFriendsResponse = {
  incoming: [],
  outgoing: [],
};
const EMPTY_FRIENDS: FriendDto[] = [];
const EMPTY_BLOCKED_USERS: Array<{
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
}> = [];
const FRIENDS_TAB_IDS = new Set<FriendsTabId>(["online", "all", "pending", "add", "blocked"]);

function isFriendsTabId(value: string | null): value is FriendsTabId {
  return value !== null && FRIENDS_TAB_IDS.has(value as FriendsTabId);
}

function getAddFriendErrorMessage(
  code: FriendErrorCode | undefined,
  t: (key: string, values?: Record<string, number | string>) => string,
) {
  if (code === "ALREADY_FRIENDS") {
    return t("friends.addFriend.errors.alreadyFriends");
  }

  if (code === "BLOCKED") {
    return t("friends.addFriend.errors.blocked");
  }

  if (code === "NOT_FOUND") {
    return t("friends.addFriend.errors.notFound");
  }

  if (code === "ALREADY_PENDING") {
    return t("friends.addFriend.errors.alreadyPending");
  }

  return t("friends.addFriend.errors.unknown");
}

function getFriendSortName(friend: FriendDto) {
  return friend.displayName || friend.username;
}

type FriendsMetricTone = "online" | "pending" | "total";

const metricToneClasses: Record<
  FriendsMetricTone,
  {
    icon: string;
    line: string;
  }
> = {
  online: {
    icon: "bg-emerald-500/10 text-emerald-600",
    line: "stroke-emerald-500",
  },
  pending: {
    icon: "bg-amber-500/10 text-amber-600",
    line: "stroke-amber-500",
  },
  total: {
    icon: "bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]",
    line: "stroke-[hsl(var(--primary))]",
  },
};

function FriendsMetricCard({
  description,
  helper,
  icon: Icon,
  loading,
  tone,
  value,
}: {
  description: string;
  helper: string;
  icon: LucideIcon;
  loading: boolean;
  tone: FriendsMetricTone;
  value: string;
}) {
  const toneClass = metricToneClasses[tone];

  return (
    <div
      className="relative min-h-[6.4rem] overflow-hidden border-b border-[hsl(var(--border)/0.58)] px-3.5 py-3.5 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:py-4 sm:last:border-r-0"
    >
      <div className="relative flex min-w-0 items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${toneClass.icon}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase leading-4 tracking-[0.22em] text-app-soft">
            {description}
          </p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-12 rounded-[10px]" />
          ) : (
            <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight text-app-foreground">
              {value}
            </p>
          )}
          <div className="mt-2.5 flex items-end justify-between gap-3">
            <p className="min-w-0 text-xs font-semibold leading-5 text-app-muted">{helper}</p>
            <svg
              aria-hidden="true"
              className="hidden h-6 w-24 shrink-0 sm:block"
              fill="none"
              viewBox="0 0 112 28"
            >
              <path
                className={`${toneClass.line} opacity-80`}
                d="M2 20 C14 19 17 17 25 18 C34 20 35 24 44 24 C54 24 54 10 64 10 C73 10 75 17 82 17 C90 17 90 13 97 13 C103 13 105 18 110 17"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function FriendsTabButton({
  active,
  badge,
  icon: Icon,
  label,
  onClick,
  testId,
}: {
  active: boolean;
  badge?: number;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[13px] border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] ${
        active
          ? "border-transparent bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
          : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.7)] text-app-muted hover:border-[hsl(var(--primary)/0.22)] hover:bg-[hsl(var(--surface-card)/0.92)] hover:text-app-foreground"
      }`}
      data-testid={testId}
      onClick={onClick}
      role="tab"
      type="button"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {badge && badge > 0 ? <Badge>{badge}</Badge> : null}
    </button>
  );
}

function EmptyChatIllustration() {
  return (
    <div className="relative h-28 w-36" aria-hidden="true">
      <div className="absolute left-5 top-5 h-16 w-20 rounded-[18px] bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(252_95%_70%))] shadow-[0_18px_38px_hsl(var(--primary)/0.22)]">
        <div className="flex h-full items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-white/85" />
          <span className="h-2 w-2 rounded-full bg-white/85" />
          <span className="h-2 w-2 rounded-full bg-white/85" />
        </div>
      </div>
      <div className="absolute bottom-3 right-1 h-16 w-20 rounded-[18px] bg-white shadow-[0_14px_30px_hsl(var(--primary)/0.14)]">
        <div className="ml-6 mt-6 h-1.5 w-10 rounded-full bg-[hsl(var(--primary)/0.22)]" />
        <div className="ml-6 mt-2.5 h-1.5 w-7 rounded-full bg-[hsl(var(--primary)/0.18)]" />
      </div>
    </div>
  );
}

function FriendsEmptyState({
  actionLabel,
  compact = false,
  description,
  onAction,
  title,
}: {
  actionLabel?: string;
  compact?: boolean;
  description: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-4 text-center ${
        compact ? "min-h-[9rem] py-5" : "min-h-[18rem] py-8 sm:min-h-[22rem] sm:py-10"
      }`}
    >
      {compact ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
          <MessageSquareMore className="h-5 w-5" />
        </div>
      ) : (
        <EmptyChatIllustration />
      )}
      <h2 className={`text-app-foreground font-semibold ${compact ? "mt-3 text-base" : "mt-4 text-lg"}`}>
        {title}
      </h2>
      <p className={`text-app-muted mt-2 max-w-md text-sm ${compact ? "leading-5" : "leading-6"}`}>
        {description}
      </p>
      {actionLabel && onAction ? (
        <button
          className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-[0_14px_28px_hsl(var(--primary)/0.18)] transition hover:bg-[hsl(var(--primary)/0.92)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          onClick={onAction}
          type="button"
        >
          <UserPlus className="h-4 w-4" />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function FriendsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="app-panel flex items-center justify-between rounded-[24px] border p-3 sm:rounded-[28px] sm:p-4" key={index}>
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-10 w-10 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

function SectionHeading({
  badge,
  title,
}: {
  badge?: number;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-app-foreground text-sm font-semibold uppercase tracking-[0.2em]">
        {title}
      </h2>
      {badge && badge > 0 ? <Badge>{badge}</Badge> : null}
    </div>
  );
}

function FriendsFeedbackNotice({
  feedback,
}: {
  feedback: {
    message: string;
    tone: "error" | "success";
  } | null;
}) {
  if (!feedback) {
    return null;
  }

  const success = feedback.tone === "success";
  const Icon = success ? CheckCircle2 : X;

  return (
    <div
      aria-live="polite"
      className={`mt-3 flex items-center gap-3 rounded-[22px] border px-4 py-3 text-sm shadow-[0_16px_42px_hsl(var(--shadow-color)/0.08)] ${
        success
          ? "border-[hsl(var(--success)/0.26)] bg-[hsl(var(--success)/0.08)] text-app-success"
          : "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.08)] text-app-danger"
      }`}
      data-testid="friend-feedback"
      role="status"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
          success
            ? "border-[hsl(var(--success)/0.26)] bg-[hsl(var(--success)/0.12)]"
            : "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.12)]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 font-medium">{feedback.message}</span>
    </div>
  );
}

function ConfirmDialog({
  busy,
  confirmLabel,
  description,
  onClose,
  onConfirm,
  open,
  safetyDescription,
  title,
}: {
  busy: boolean;
  confirmLabel: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  safetyDescription: string;
  title: string;
}) {
  const { t } = useI18n();

  return (
    <Modal
      description={description}
      onClose={busy ? () => undefined : onClose}
      open={open}
      title={title}
    >
      <div className="rounded-[24px] border border-[hsl(var(--danger)/0.18)] bg-[hsl(var(--danger)/0.06)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.1)] text-app-danger">
            <UserMinus className="h-5 w-5" />
          </div>
          <p className="text-sm leading-6 text-app-muted">
            {safetyDescription}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          className="min-h-11 rounded-2xl border border-[hsl(var(--border)/0.82)] px-4 py-2 text-sm font-medium text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
          disabled={busy}
          onClick={onClose}
          type="button"
        >
          {t("common.cancel")}
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--danger))] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger-foreground))] shadow-[0_16px_34px_hsl(var(--danger)/0.18)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] disabled:opacity-60"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function PendingRequestRow({
  actionSlot,
  request,
  type,
}: {
  actionSlot: ReactNode;
  request: FriendRequestDto;
  type: "incoming" | "outgoing";
}) {
  const counterpart = type === "incoming" ? request.sender : request.receiver;
  const displayName = counterpart.displayName ?? counterpart.username;

  return (
    <div
      className="app-panel flex flex-col gap-3 rounded-[24px] border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-[28px] sm:p-4"
      data-testid={`friend-request-${type}-${counterpart.username}`}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Avatar
          alt={displayName}
          className="h-11 w-11 shrink-0 text-sm"
          fallback={displayName}
          src={counterpart.avatarUrl}
        />
        <div className="min-w-0">
          <p className="text-app-foreground truncate text-sm font-semibold">{displayName}</p>
          <p className="text-app-muted truncate text-sm">@{counterpart.username}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">{actionSlot}</div>
    </div>
  );
}

export function FriendsView({ currentUserId }: { currentUserId: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledDmIntentRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<FriendsTabId>("online");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const [username, setUsername] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");

  const friendsQuery = useQuery({
    queryFn: fetchFriends,
    queryKey: friendsQueryKeys.list,
    staleTime: 30_000,
  });

  const pendingQuery = useQuery({
    queryFn: fetchPendingFriends,
    queryKey: friendsQueryKeys.pending,
    staleTime: 15_000,
  });

  const blockedQuery = useQuery({
    enabled: activeTab === "blocked",
    queryFn: fetchBlockedFriends,
    queryKey: friendsQueryKeys.blocked,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handlePresenceUpdate = (update: {
      customStatus: string | null;
      status: FriendDto["status"];
      userId: string;
    }) => {
      queryClient.setQueryData(friendsQueryKeys.list, (current: FriendDto[] | undefined) =>
        applyFriendPresenceUpdate(current, update),
      );
    };
    const handleFriendsUpdated = () => {
      void queryClient.refetchQueries({
        queryKey: friendsQueryKeys.root,
        type: "active",
      });
    };

    socket.on("presence:update", handlePresenceUpdate);
    socket.on("friends:updated", handleFriendsUpdated);

    return () => {
      socket.off("presence:update", handlePresenceUpdate);
      socket.off("friends:updated", handleFriendsUpdated);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, [queryClient, socket]);

  const friends = friendsQuery.data ?? EMPTY_FRIENDS;
  const pending = pendingQuery.data ?? EMPTY_PENDING;
  const blockedUsers = blockedQuery.data ?? EMPTY_BLOCKED_USERS;
  const incomingCount = pending.incoming.length;
  const normalizedUsername = username.trim();
  const canSendRequest =
    normalizedUsername.length >= 2 &&
    debouncedUsername === normalizedUsername;

  const onlineFriends = useMemo(
    () => friends.filter((friend) => friend.status === "ONLINE" || friend.status === "IDLE"),
    [friends],
  );
  const selectNewChatTab = useCallback(() => {
    setActiveTab(friends.length > 0 ? "all" : "add");
  }, [friends.length]);

  useEffect(() => {
    const requestedTab = searchParams.get("dmTab");

    if (isFriendsTabId(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    const dmAction = searchParams.get("dmAction");

    if (dmAction !== "new" || friendsQuery.isLoading) {
      return;
    }

    const intentKey = searchParams.toString();

    if (handledDmIntentRef.current === intentKey) {
      return;
    }

    handledDmIntentRef.current = intentKey;
    selectNewChatTab();
    router.replace("/channels/@me", { scroll: false });
  }, [friendsQuery.isLoading, router, searchParams, selectNewChatTab]);

  const sortedFriends = useMemo(
    () =>
      [...friends].sort((left, right) =>
        getFriendSortName(left).localeCompare(getFriendSortName(right), locale, {
          sensitivity: "base",
        }),
      ),
    [friends, locale],
  );

  const scheduleSuccessFeedbackClear = () => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }

    feedbackTimerRef.current = setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 3000);
  };

  const sendRequestMutation = useMutation({
    mutationFn: (value: string) => sendFriendRequestRequest(value),
    onError: (error) => {
      setFeedback({
        message:
          error instanceof FriendsClientError
            ? getAddFriendErrorMessage(error.code, t)
            : t("friends.addFriend.errors.unknown"),
        tone: "error",
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
    onSuccess: (request) => {
      setUsername("");
      setDebouncedUsername("");
      setFeedback({
        message: t("friends.addFriend.success", {
          username: request.receiver.username,
        }),
        tone: "success",
      });
      scheduleSuccessFeedbackClear();
    },
  });

  const requestActionMutation = useMutation<
    FriendRequestDto,
    Error,
    { action: "accept" | "decline"; requestId: string },
    { previousPending: PendingFriendsResponse }
  >({
    mutationFn: ({ action, requestId }) => actOnFriendRequestRequest(requestId, action),
    onError: (_error, _variables, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(friendsQueryKeys.pending, context.previousPending);
      }
    },
    onMutate: async ({ requestId }) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.pending });
      const previousPending =
        queryClient.getQueryData<PendingFriendsResponse>(friendsQueryKeys.pending) ?? EMPTY_PENDING;

      queryClient.setQueryData<PendingFriendsResponse>(friendsQueryKeys.pending, {
        ...previousPending,
        incoming: previousPending.incoming.filter((request) => request.id !== requestId),
      });

      return { previousPending };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const cancelRequestMutation = useMutation<
    { success: true },
    Error,
    string,
    { previousPending: PendingFriendsResponse }
  >({
    mutationFn: (requestId: string) => cancelFriendRequestRequest(requestId),
    onError: (_error, _variables, context) => {
      if (context?.previousPending) {
        queryClient.setQueryData(friendsQueryKeys.pending, context.previousPending);
      }
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.pending });
      const previousPending =
        queryClient.getQueryData<PendingFriendsResponse>(friendsQueryKeys.pending) ?? EMPTY_PENDING;

      queryClient.setQueryData<PendingFriendsResponse>(friendsQueryKeys.pending, {
        ...previousPending,
        outgoing: previousPending.outgoing.filter((request) => request.id !== requestId),
      });

      return { previousPending };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const removeFriendMutation = useMutation<
    { success: true },
    Error,
    FriendDto,
    { previousFriends: FriendDto[] | undefined }
  >({
    mutationFn: (friend) => removeFriendRequest(friend.id),
    onMutate: async (friend) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.list });

      const previousFriends = queryClient.getQueryData<FriendDto[]>(friendsQueryKeys.list);

      queryClient.setQueryData<FriendDto[] | undefined>(friendsQueryKeys.list, (current) =>
        current?.filter((candidate) => candidate.id !== friend.id),
      );
      setConfirmState(null);
      setFeedback(null);

      return { previousFriends };
    },
    onError: (_error, _friend, context) => {
      if (context?.previousFriends) {
        queryClient.setQueryData(friendsQueryKeys.list, context.previousFriends);
      }
      setFeedback({
        message: t("friends.remove.error"),
        tone: "error",
      });
    },
    onSuccess: (_result, friend) => {
      setFeedback({
        message: t("friends.remove.success", {
          name: friend.displayName ?? friend.username,
        }),
        tone: "success",
      });
      scheduleSuccessFeedbackClear();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const blockFriendMutation = useMutation({
    mutationFn: (friendUserId: string) => blockFriendRequest(friendUserId),
    onSettled: async () => {
      setConfirmState(null);
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const unblockFriendMutation = useMutation({
    mutationFn: (friendUserId: string) => unblockFriendRequest(friendUserId),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  const openDirectMessageMutation = useMutation({
    mutationFn: (friendUserId: string) => createDMConversationRequest(friendUserId),
    onError: () => {
      setFeedback({
        message: t("dm.errors.openConversation"),
        tone: "error",
      });
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData<DMConversationsInfiniteData | undefined>(dmQueryKeys.list, (current) =>
        upsertDMConversationPageData(current, conversation),
      );
      router.push(`/channels/@me/${conversation.id}`);
    },
  });

  const activeConfirmBusy = removeFriendMutation.isPending || blockFriendMutation.isPending;
  const metricsLoading = friendsQuery.isLoading || pendingQuery.isLoading;
  const isRefreshing =
    friendsQuery.isFetching ||
    pendingQuery.isFetching ||
    (activeTab === "blocked" && blockedQuery.isFetching);

  const refreshDashboardData = () => {
    void friendsQuery.refetch();
    void pendingQuery.refetch();

    if (activeTab === "blocked") {
      void blockedQuery.refetch();
    }
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);

    if (feedback) {
      setFeedback(null);
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedUsername(value.trim());
      debounceRef.current = null;
    }, 500);
  };

  return (
    <>
      <div
        aria-busy={metricsLoading}
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.06),transparent_28rem)]"
        data-testid="friends-dashboard"
      >
        <div className="shrink-0 px-2.5 pb-2 pt-2.5 sm:px-3 sm:pb-2.5 sm:pt-3 md:px-4">
          <div className="app-panel relative overflow-hidden rounded-[18px] border shadow-[0_12px_34px_hsl(var(--shadow-color)/0.04)]">
            <div className="grid grid-cols-1 sm:grid-cols-3">
              <FriendsMetricCard
                description={t("friends.overview.onlineNow")}
                helper={t("friends.overview.onlineHelper")}
                icon={Users}
                loading={metricsLoading}
                tone="online"
                value={String(onlineFriends.length)}
              />
              <FriendsMetricCard
                description={t("friends.overview.totalFriends")}
                helper={t("friends.overview.totalHelper")}
                icon={UserPlus}
                loading={metricsLoading}
                tone="total"
                value={String(friends.length)}
              />
              <FriendsMetricCard
                description={t("friends.overview.pendingRequests")}
                helper={t("friends.overview.pendingHelper")}
                icon={Clock3}
                loading={metricsLoading}
                tone="pending"
                value={String(incomingCount)}
              />
            </div>
            <button
              aria-label={t("friends.actions.refresh")}
              className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-[12px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.82)] text-app-muted shadow-[0_10px_22px_hsl(var(--shadow-color)/0.045)] transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
              disabled={isRefreshing}
              onClick={refreshDashboardData}
              type="button"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="app-panel mt-2.5 rounded-[18px] border px-2.5 py-2.5 shadow-[0_10px_26px_hsl(var(--shadow-color)/0.035)]">
            <div className="flex min-w-0 flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap gap-2 pb-1 sm:flex-nowrap sm:overflow-x-auto" role="tablist">
              <FriendsTabButton
                active={activeTab === "online"}
                icon={Users}
                label={t("friends.tabs.online")}
                onClick={() => setActiveTab("online")}
                testId="friends-tab-online"
              />
              <FriendsTabButton
                active={activeTab === "all"}
                icon={Users}
                label={t("friends.tabs.all")}
                onClick={() => setActiveTab("all")}
                testId="friends-tab-all"
              />
              <FriendsTabButton
                active={activeTab === "pending"}
                badge={incomingCount}
                icon={Clock3}
                label={t("friends.tabs.pending")}
                onClick={() => setActiveTab("pending")}
                testId="friends-tab-pending"
              />
              <FriendsTabButton
                active={activeTab === "add"}
                icon={UserPlus}
                label={t("friends.tabs.addFriend")}
                onClick={() => setActiveTab("add")}
                testId="friends-tab-add"
              />
              <FriendsTabButton
                active={activeTab === "blocked"}
                icon={Ban}
                label={t("friends.tabs.blocked")}
                onClick={() => setActiveTab("blocked")}
                testId="friends-tab-blocked"
              />
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-app-muted">
                <span className="hidden uppercase tracking-[0.18em] sm:inline">
                  {t("friends.sort.label")}
                </span>
                <span className="rounded-[12px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] px-2.5 py-1.5 text-app-foreground">
                  {t("friends.sort.newest")}
                </span>
              </div>
            </div>
          </div>
          <FriendsFeedbackNotice feedback={feedback} />
        </div>

        <div className="min-h-0 flex-1 px-2.5 pb-2.5 pt-0 sm:px-3 sm:pb-3 md:px-4 md:pb-4">
          <div className="app-panel flex h-full min-h-[22rem] flex-col overflow-hidden rounded-[18px] border shadow-[0_16px_44px_hsl(var(--shadow-color)/0.04)]">
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3 md:p-4">
          {activeTab === "online" ? (
            friendsQuery.isLoading ? (
              <FriendsListSkeleton />
            ) : friends.length === 0 ? (
              <FriendsEmptyState
                actionLabel={t("friends.tabs.addFriend")}
                description={t("friends.empty.noFriends")}
                onAction={() => setActiveTab("add")}
                title={t("friends.tabs.online")}
              />
            ) : onlineFriends.length === 0 ? (
              <FriendsEmptyState
                actionLabel={t("friends.actions.startChat")}
                description={t("friends.empty.noOnline")}
                onAction={() => setActiveTab("all")}
                title={t("friends.tabs.online")}
              />
            ) : (
              <div className="space-y-3">
                {onlineFriends.map((friend) => (
                  <FriendCard
                    currentUserId={currentUserId}
                    friend={friend}
                    key={friend.id}
                    onBlock={(nextFriend) => setConfirmState({ friend: nextFriend, type: "block" })}
                    onMessage={(nextFriend) => openDirectMessageMutation.mutate(nextFriend.id)}
                    onRemove={(nextFriend) => setConfirmState({ friend: nextFriend, type: "remove" })}
                  />
                ))}
              </div>
            )
          ) : null}

          {activeTab === "all" ? (
            friendsQuery.isLoading ? (
              <FriendsListSkeleton />
            ) : friends.length === 0 ? (
              <FriendsEmptyState
                actionLabel={t("friends.tabs.addFriend")}
                description={t("friends.empty.noFriends")}
                onAction={() => setActiveTab("add")}
                title={t("friends.tabs.all")}
              />
            ) : (
              <div className="space-y-3">
                {sortedFriends.map((friend) => (
                  <FriendCard
                    currentUserId={currentUserId}
                    friend={friend}
                    key={friend.id}
                    onBlock={(nextFriend) => setConfirmState({ friend: nextFriend, type: "block" })}
                    onMessage={(nextFriend) => openDirectMessageMutation.mutate(nextFriend.id)}
                    onRemove={(nextFriend) => setConfirmState({ friend: nextFriend, type: "remove" })}
                  />
                ))}
              </div>
            )
          ) : null}

          {activeTab === "pending" ? (
            pendingQuery.isLoading ? (
              <FriendsListSkeleton />
            ) : (
              <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
                <section className="space-y-2 sm:space-y-3">
                  <SectionHeading badge={incomingCount} title={t("friends.pending.incomingTitle")} />
                  {pending.incoming.length === 0 ? (
                    <FriendsEmptyState
                      compact
                      description={t("friends.empty.incoming")}
                      title={t("friends.pending.incomingTitle")}
                    />
                  ) : (
                    pending.incoming.map((request) => (
                      <PendingRequestRow
                        actionSlot={
                          <>
                            <button
                              aria-label={t("friends.actions.accept")}
                              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--success))] text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--success)/0.45)]"
                              data-testid={`friend-request-accept-${request.sender.username}`}
                              onClick={() =>
                                requestActionMutation.mutate({
                                  action: "accept",
                                  requestId: request.id,
                                })
                              }
                              type="button"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              aria-label={t("friends.actions.decline")}
                              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--danger))] text-[hsl(var(--danger-foreground))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)]"
                              data-testid={`friend-request-decline-${request.sender.username}`}
                              onClick={() =>
                                requestActionMutation.mutate({
                                  action: "decline",
                                  requestId: request.id,
                                })
                              }
                              type="button"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        }
                        key={request.id}
                        request={request}
                        type="incoming"
                      />
                    ))
                  )}
                </section>

                <section className="space-y-2 sm:space-y-3">
                  <SectionHeading title={t("friends.pending.outgoingTitle")} />
                  {pending.outgoing.length === 0 ? (
                    <FriendsEmptyState
                      compact
                      description={t("friends.empty.outgoing")}
                      title={t("friends.pending.outgoingTitle")}
                    />
                  ) : (
                    pending.outgoing.map((request) => (
                      <PendingRequestRow
                        actionSlot={
                          <button
                            className="min-h-11 rounded-2xl border border-[hsl(var(--border)/0.82)] px-4 py-2 text-sm font-medium text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                            onClick={() => cancelRequestMutation.mutate(request.id)}
                            type="button"
                          >
                            {t("friends.actions.cancel")}
                          </button>
                        }
                        key={request.id}
                        request={request}
                        type="outgoing"
                      />
                    ))
                  )}
                </section>
              </div>
            )
          ) : null}

          {activeTab === "add" ? (
            <div className="app-panel max-w-3xl rounded-[28px] border p-4 sm:p-6 md:rounded-[32px] md:p-8">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="app-panel-soft flex h-14 w-14 items-center justify-center rounded-[22px] border">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-app-foreground text-xl font-semibold">
                    {t("friends.addFriend.title")}
                  </h2>
                  <p className="text-app-muted mt-2 text-sm leading-6">
                    {t("friends.addFriend.description")}
                  </p>
                </div>
              </div>

              <label
                className="mt-6 block text-sm font-medium text-app-foreground"
                htmlFor="friend-username"
              >
                {t("friends.addFriend.inputLabel")}
              </label>

              <form
                className="mt-3 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();

                  if (canSendRequest) {
                    sendRequestMutation.mutate(normalizedUsername);
                  }
                }}
              >
                <Input
                  autoComplete="off"
                  data-testid="friend-username-input"
                  id="friend-username"
                  onChange={(event) => handleUsernameChange(event.target.value)}
                  placeholder={t("friends.addFriend.placeholder")}
                  value={username}
                />
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.45)] disabled:opacity-60"
                  data-testid="send-friend-request-button"
                  disabled={!canSendRequest || sendRequestMutation.isPending}
                  type="submit"
                >
                  {sendRequestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SendHorizontal className="h-4 w-4" />
                  )}
                  {t("friends.actions.sendRequest")}
                </button>
              </form>
            </div>
          ) : null}

          {activeTab === "blocked" ? (
            blockedQuery.isLoading ? (
              <FriendsListSkeleton />
            ) : blockedUsers.length === 0 ? (
              <FriendsEmptyState
                description={t("friends.empty.blocked")}
                title={t("friends.tabs.blocked")}
              />
            ) : (
              <div className="space-y-3">
                {blockedUsers.map((user) => {
                  const displayName = user.displayName ?? user.username;

                  return (
                    <div
                      className="app-panel flex flex-col gap-3 rounded-[24px] border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-[28px] sm:p-4"
                      key={user.id}
                    >
                      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                        <Avatar
                          alt={displayName}
                          className="h-11 w-11 shrink-0 text-sm sm:h-12 sm:w-12"
                          fallback={displayName}
                          src={user.avatarUrl}
                        />
                        <div className="min-w-0">
                          <p className="text-app-foreground truncate text-sm font-semibold">
                            {displayName}
                          </p>
                          <p className="text-app-muted truncate text-sm">@{user.username}</p>
                        </div>
                      </div>
                      <button
                        className="min-h-11 rounded-2xl border border-[hsl(var(--border)/0.82)] px-4 py-2 text-sm font-medium text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
                        disabled={unblockFriendMutation.isPending}
                        onClick={() => unblockFriendMutation.mutate(user.id)}
                        type="button"
                      >
                        {t("friends.actions.unblock")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        busy={activeConfirmBusy}
        confirmLabel={
          confirmState?.type === "block"
            ? t("friends.confirm.block.action")
            : t("friends.confirm.remove.action")
        }
        description={
          confirmState?.type === "block"
            ? t("friends.confirm.block.description")
            : t("friends.confirm.remove.description")
        }
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          if (!confirmState) {
            return;
          }

          if (confirmState.type === "block") {
            blockFriendMutation.mutate(confirmState.friend.id);
            return;
          }

          removeFriendMutation.mutate(confirmState.friend);
        }}
        open={Boolean(confirmState)}
        safetyDescription={
          confirmState?.type === "block"
            ? t("friends.confirm.block.safety")
            : t("friends.confirm.remove.safety")
        }
        title={
          confirmState?.type === "block"
            ? t("friends.confirm.block.title", {
                name: confirmState.friend.displayName ?? confirmState.friend.username,
              })
            : t("friends.confirm.remove.title", {
                name: confirmState?.friend.displayName ?? confirmState?.friend.username ?? "",
              })
        }
      />
    </>
  );
}
