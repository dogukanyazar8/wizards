"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Check,
  Clock3,
  Loader2,
  SendHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DMConversationDTO } from "@wizards/types";
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
  dmQueryKeys,
  upsertDMConversation,
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

function FriendsMetricCard({
  description,
  icon: Icon,
  value,
}: {
  description: string;
  icon: LucideIcon;
  value: string;
}) {
  return (
    <div className="app-panel rounded-[24px] border p-3 shadow-[0_12px_32px_hsl(var(--shadow-color)/0.06)] sm:rounded-[28px] sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-app-soft text-[11px] font-semibold uppercase tracking-[0.22em]">
            {description}
          </p>
          <p className="text-app-foreground mt-2 text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl">
            {value}
          </p>
        </div>
        <div className="app-panel-soft flex h-11 w-11 items-center justify-center rounded-[18px] border sm:h-12 sm:w-12">
          <Icon className="h-5 w-5 text-app-foreground" />
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
}: {
  active: boolean;
  badge?: number;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] ${
        active
          ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--foreground))]"
          : "border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface-soft)/0.36)] text-app-muted hover:text-[hsl(var(--foreground))]"
      }`}
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

function FriendsEmptyState({
  description,
  icon: Icon,
  compact = false,
  title,
}: {
  compact?: boolean;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div
      className={`app-panel flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[hsl(var(--border)/0.72)] px-4 text-center sm:rounded-[32px] sm:px-6 ${
        compact
          ? "min-h-[132px] py-5 sm:min-h-[220px] sm:py-8"
          : "min-h-[240px] py-10 sm:min-h-[320px] sm:py-14"
      }`}
    >
      <div
        className={`app-panel-soft flex items-center justify-center rounded-[24px] border ${
          compact ? "h-12 w-12 sm:h-14 sm:w-14" : "h-16 w-16"
        }`}
      >
        <Icon className={`text-app-muted ${compact ? "h-5 w-5" : "h-6 w-6"}`} />
      </div>
      <h2 className={`text-app-foreground font-semibold ${compact ? "mt-3 text-base" : "mt-5 text-lg"}`}>
        {title}
      </h2>
      <p className={`text-app-muted mt-2 max-w-md text-sm ${compact ? "leading-5" : "leading-6"}`}>
        {description}
      </p>
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

function ConfirmDialog({
  busy,
  confirmLabel,
  description,
  onClose,
  onConfirm,
  open,
  title,
}: {
  busy: boolean;
  confirmLabel: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
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
      <div className="flex justify-end gap-3">
        <button
          className="rounded-2xl border border-[hsl(var(--border)/0.82)] px-4 py-2 text-sm font-medium text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          disabled={busy}
          onClick={onClose}
          type="button"
        >
          {t("common.cancel")}
        </button>
        <button
          className="rounded-2xl bg-[hsl(var(--danger))] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger-foreground))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)] disabled:opacity-60"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
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
    <div className="app-panel flex flex-col gap-3 rounded-[24px] border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-[28px] sm:p-4">
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

export function FriendsView() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const removeFriendMutation = useMutation({
    mutationFn: (friendUserId: string) => removeFriendRequest(friendUserId),
    onSettled: async () => {
      setConfirmState(null);
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
      queryClient.setQueryData<DMConversationDTO[] | undefined>(dmQueryKeys.list, (current) =>
        upsertDMConversation(current, conversation),
      );
      router.push(`/channels/@me/${conversation.id}`);
    },
  });

  const activeConfirmBusy = removeFriendMutation.isPending || blockFriendMutation.isPending;

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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-[hsl(var(--border)/0.72)] px-3 py-3 sm:px-4 sm:py-4 md:px-6">
          <div className="grid gap-2 sm:gap-3 xl:grid-cols-3">
            <FriendsMetricCard
              description={t("friends.overview.onlineNow")}
              icon={Users}
              value={String(onlineFriends.length)}
            />
            <FriendsMetricCard
              description={t("friends.overview.totalFriends")}
              icon={UserPlus}
              value={String(friends.length)}
            />
            <FriendsMetricCard
              description={t("friends.overview.pendingRequests")}
              icon={Clock3}
              value={String(incomingCount)}
            />
          </div>

          <div className="app-panel mt-3 rounded-[24px] border p-2 sm:mt-4 sm:rounded-[28px] sm:p-3">
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
              <FriendsTabButton
                active={activeTab === "online"}
                icon={Users}
                label={t("friends.tabs.online")}
                onClick={() => setActiveTab("online")}
              />
              <FriendsTabButton
                active={activeTab === "all"}
                icon={Users}
                label={t("friends.tabs.all")}
                onClick={() => setActiveTab("all")}
              />
              <FriendsTabButton
                active={activeTab === "pending"}
                badge={incomingCount}
                icon={Clock3}
                label={t("friends.tabs.pending")}
                onClick={() => setActiveTab("pending")}
              />
              <FriendsTabButton
                active={activeTab === "add"}
                icon={UserPlus}
                label={t("friends.tabs.addFriend")}
                onClick={() => setActiveTab("add")}
              />
              <FriendsTabButton
                active={activeTab === "blocked"}
                icon={Ban}
                label={t("friends.tabs.blocked")}
                onClick={() => setActiveTab("blocked")}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5 md:px-6 md:py-6">
          {activeTab === "online" ? (
            friendsQuery.isLoading ? (
              <FriendsListSkeleton />
            ) : friends.length === 0 ? (
              <FriendsEmptyState
                description={t("friends.empty.noFriends")}
                icon={Users}
                title={t("friends.tabs.online")}
              />
            ) : onlineFriends.length === 0 ? (
              <FriendsEmptyState
                description={t("friends.empty.noOnline")}
                icon={Clock3}
                title={t("friends.tabs.online")}
              />
            ) : (
              <div className="space-y-3">
                {onlineFriends.map((friend) => (
                  <FriendCard
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
                description={t("friends.empty.noFriends")}
                icon={Users}
                title={t("friends.tabs.all")}
              />
            ) : (
              <div className="space-y-3">
                {sortedFriends.map((friend) => (
                  <FriendCard
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
                      icon={Clock3}
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
                      icon={Clock3}
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

              {feedback ? (
                <div
                  className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                    feedback.tone === "success"
                      ? "border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]"
                      : "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger-foreground))]"
                  }`}
                >
                  {feedback.message}
                </div>
              ) : null}

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
                  id="friend-username"
                  onChange={(event) => handleUsernameChange(event.target.value)}
                  placeholder={t("friends.addFriend.placeholder")}
                  value={username}
                />
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.45)] disabled:opacity-60"
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
                icon={Ban}
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

          removeFriendMutation.mutate(confirmState.friend.id);
        }}
        open={Boolean(confirmState)}
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
