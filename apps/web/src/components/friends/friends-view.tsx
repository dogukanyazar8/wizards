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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FriendDto, FriendErrorCode, FriendRequestDto, PendingFriendsResponse } from "@/lib/friends/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/components/providers/locale-provider";
import { FriendCard } from "@/components/friends/friend-card";
import { useSocket } from "@/hooks/use-socket";
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

function FriendsEmptyState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="app-panel flex flex-col items-center justify-center rounded-[32px] border border-dashed border-[hsl(var(--border)/0.72)] px-6 py-14 text-center">
      <div className="app-panel-soft flex h-16 w-16 items-center justify-center rounded-[24px] border">
        <Icon className="text-app-muted h-6 w-6" />
      </div>
      <h2 className="text-app-foreground mt-5 text-lg font-semibold">{title}</h2>
      <p className="text-app-muted mt-2 max-w-md text-sm leading-6">{description}</p>
    </div>
  );
}

function FriendsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="app-panel flex items-center justify-between rounded-[28px] border p-4" key={index}>
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
    <Modal description={description} onClose={busy ? () => undefined : onClose} open={open} title={title}>
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
    <div className="app-panel flex items-center justify-between gap-4 rounded-[28px] border p-4">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar
          alt={displayName}
          className="h-11 w-11 text-sm"
          fallback={displayName}
          src={counterpart.avatarUrl}
        />
        <div className="min-w-0">
          <p className="text-app-foreground truncate text-sm font-semibold">{displayName}</p>
          <p className="text-app-muted truncate text-sm">@{counterpart.username}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actionSlot}</div>
    </div>
  );
}

export function FriendsView() {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const socket = useSocket();
  const [activeTab, setActiveTab] = useState<FriendsTabId>("online");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const [messagePlaceholder, setMessagePlaceholder] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedUsername(username.trim());
    }, 500);

    return () => window.clearTimeout(handle);
  }, [username]);

  useEffect(() => {
    if (feedback?.tone !== "success") {
      return;
    }

    const handle = window.setTimeout(() => setFeedback(null), 3000);
    return () => window.clearTimeout(handle);
  }, [feedback]);

  useEffect(() => {
    if (!messagePlaceholder) {
      return;
    }

    const handle = window.setTimeout(() => setMessagePlaceholder(null), 3000);
    return () => window.clearTimeout(handle);
  }, [messagePlaceholder]);

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

    socket.on("presence:update", handlePresenceUpdate);

    return () => {
      socket.off("presence:update", handlePresenceUpdate);
    };
  }, [queryClient, socket]);

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
    },
  });

  const requestActionMutation = useMutation<
    FriendRequestDto,
    Error,
    { action: "accept" | "decline"; requestId: string },
    { previousPending: PendingFriendsResponse }
  >({
    mutationFn: ({
      action,
      requestId,
    }: {
      action: "accept" | "decline";
      requestId: string;
    }) => actOnFriendRequestRequest(requestId, action),
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

  const activeConfirmBusy =
    removeFriendMutation.isPending || blockFriendMutation.isPending;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-[hsl(var(--border)/0.78)] px-4 py-4 md:px-6">
          <div className="flex flex-wrap gap-2" role="tablist">
            {[
              { id: "online", icon: Users, label: t("friends.tabs.online") },
              { id: "all", icon: Users, label: t("friends.tabs.all") },
              {
                badge: incomingCount,
                id: "pending",
                icon: Clock3,
                label: t("friends.tabs.pending"),
              },
              { id: "add", icon: UserPlus, label: t("friends.tabs.addFriend") },
              { id: "blocked", icon: Ban, label: t("friends.tabs.blocked") },
            ].map(({ badge, icon: Icon, id, label }) => {
              const isActive = activeTab === id;

              return (
                <button
                  aria-selected={isActive}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] ${
                    isActive
                      ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--foreground))]"
                      : "border-[hsl(var(--border)/0.78)] bg-[hsl(var(--surface-soft)/0.36)] text-app-muted hover:text-[hsl(var(--foreground))]"
                  }`}
                  key={id}
                  onClick={() => setActiveTab(id as FriendsTabId)}
                  role="tab"
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                  {badge ? <Badge>{badge}</Badge> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
          {messagePlaceholder ? (
            <div className="mb-4 rounded-2xl border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.08)] px-4 py-3 text-sm text-app-foreground">
              {messagePlaceholder}
            </div>
          ) : null}

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
                    onMessage={() => setMessagePlaceholder(t("friends.message.placeholder"))}
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
                    onMessage={() => setMessagePlaceholder(t("friends.message.placeholder"))}
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
              <div className="grid gap-6 xl:grid-cols-2">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-app-foreground text-sm font-semibold uppercase tracking-[0.2em]">
                      {t("friends.pending.incomingTitle")}
                    </h2>
                    {incomingCount > 0 ? <Badge>{incomingCount}</Badge> : null}
                  </div>
                  {pending.incoming.length === 0 ? (
                    <FriendsEmptyState
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
                              className="rounded-2xl bg-[hsl(var(--success))] p-2.5 text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--success)/0.45)]"
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
                              className="rounded-2xl bg-[hsl(var(--danger))] p-2.5 text-[hsl(var(--danger-foreground))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--danger)/0.45)]"
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

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-app-foreground text-sm font-semibold uppercase tracking-[0.2em]">
                      {t("friends.pending.outgoingTitle")}
                    </h2>
                  </div>
                  {pending.outgoing.length === 0 ? (
                    <FriendsEmptyState
                      description={t("friends.empty.outgoing")}
                      icon={Clock3}
                      title={t("friends.pending.outgoingTitle")}
                    />
                  ) : (
                    pending.outgoing.map((request) => (
                      <PendingRequestRow
                        actionSlot={
                          <button
                            className="rounded-2xl border border-[hsl(var(--border)/0.82)] px-4 py-2 text-sm font-medium text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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
            <div className="app-panel max-w-2xl rounded-[32px] border p-6 md:p-8">
              <div className="flex items-start gap-4">
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

              <label className="mt-6 block text-app-foreground text-sm font-medium" htmlFor="friend-username">
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
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (feedback) {
                      setFeedback(null);
                    }
                  }}
                  placeholder={t("friends.addFriend.placeholder")}
                  value={username}
                />
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.45)] disabled:opacity-60"
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
                      className="app-panel flex items-center justify-between gap-4 rounded-[28px] border p-4"
                      key={user.id}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <Avatar
                          alt={displayName}
                          className="h-12 w-12 text-sm"
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
                        className="rounded-2xl border border-[hsl(var(--border)/0.82)] px-4 py-2 text-sm font-medium text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:opacity-60"
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
