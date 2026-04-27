"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  sendFriendRequestRequest,
  cancelFriendRequestRequest,
  actOnFriendRequestRequest,
  removeFriendRequest,
  unblockFriendRequest,
  fetchFriends,
  fetchPendingFriends,
  fetchBlockedFriends,
  friendsQueryKeys,
  FriendsClientError,
} from "@/lib/friends/client";
import { createDMConversationRequest } from "@/lib/dm/client";
import type { FriendDto, PendingFriendsResponse } from "@/lib/friends/types";

interface UserProfileData {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  bannerColor: string | null;
  bannerUrl: string | null;
  customStatus: string | null;
  bio: string | null;
  createdAt: string;
  serverNickname: string | null;
}

type RelationshipState =
  | "self"
  | "loading"
  | "not_friends"
  | "friends"
  | "blocked_by_me"
  | "blocked_by_them"
  | { type: "request_sent"; requestId: string }
  | { type: "request_received"; requestId: string };

type UserProfilePopoverProps = {
  userId: string;
  currentUserId: string;
  serverId?: string;
  children: React.ReactNode;
};

export function UserProfilePopover({ userId, currentUserId, serverId, children }: UserProfilePopoverProps) {
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [blockedByThem, setBlockedByThem] = useState(false);

  const isSelf = currentUserId === userId;

  const profileQuery = useQuery({
    queryKey: ["user-profile", userId, serverId ?? null],
    queryFn: async () => {
      const url = `/api/v1/users/${userId}/profile${serverId ? `?serverId=${serverId}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Profile fetch failed");
      return res.json() as Promise<UserProfileData>;
    },
    enabled: open,
    staleTime: 60_000,
  });

  const friendsQuery = useQuery({
    queryKey: friendsQueryKeys.list,
    queryFn: fetchFriends,
    enabled: open && !isSelf,
  });

  const pendingQuery = useQuery({
    queryKey: friendsQueryKeys.pending,
    queryFn: fetchPendingFriends,
    enabled: open && !isSelf,
  });

  const blockedQuery = useQuery({
    queryKey: friendsQueryKeys.blocked,
    queryFn: fetchBlockedFriends,
    enabled: open && !isSelf,
  });

  const relationshipState = useMemo((): RelationshipState => {
    if (isSelf) return "self";
    if (!friendsQuery.data || !pendingQuery.data || !blockedQuery.data) return "loading";

    const friends = friendsQuery.data as FriendDto[] | undefined;
    const blocked = blockedQuery.data as FriendDto[] | undefined;
    const pending = pendingQuery.data as PendingFriendsResponse | undefined;

    if (blocked?.find((b) => b.id === userId)) {
      return "blocked_by_me";
    }

    if (friends?.find((f) => f.id === userId)) {
      return "friends";
    }

    const outgoing = pending?.outgoing?.find((r) => r.receiverId === userId);
    if (outgoing) {
      return { type: "request_sent", requestId: outgoing.id };
    }

    const incoming = pending?.incoming?.find((r) => r.senderId === userId);
    if (incoming) {
      return { type: "request_received", requestId: incoming.id };
    }

    if (blockedByThem) {
      return "blocked_by_them";
    }

    return "not_friends";
  }, [friendsQuery.data, pendingQuery.data, blockedQuery.data, userId, isSelf, blockedByThem]);

  const handleTriggerClick = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    let x = rect.right + 12;
    let y = rect.top;

    if (x + 320 > window.innerWidth) {
      x = rect.left - 320 - 12;
    }

    if (y + 480 > window.innerHeight) {
      y = Math.max(8, window.innerHeight - 480);
    }

    setPopoverPos({ x, y });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const handler = (e: PointerEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", handler);
    return () => window.removeEventListener("pointerdown", handler);
  }, [open]);

  return (
    <>
      <div ref={triggerRef} onClick={handleTriggerClick} className="cursor-pointer">
        {children}
      </div>

      {popoverPos &&
        createPortal(
          <motion.div
            ref={popoverRef}
            className="fixed z-[60] w-80 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-xl"
            style={{ left: `${popoverPos.x}px`, top: `${popoverPos.y}px` }}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {/* Banner */}
            <div
              className="h-20 w-full"
              style={{
                backgroundColor: profileQuery.data?.bannerColor || "hsl(var(--primary)/0.1)",
                backgroundImage: profileQuery.data?.bannerUrl
                  ? `url(${profileQuery.data.bannerUrl})`
                  : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />

            {/* Profile Content */}
            <div className="relative px-4 pb-4">
              {/* Avatar */}
              <div className="-mt-10 mb-3">
                <Avatar
                  src={profileQuery.data?.avatarUrl}
                  alt={profileQuery.data?.displayName || "User"}
                  className="h-20 w-20 border-4 border-[hsl(var(--surface))]"
                  fallback={(profileQuery.data?.displayName ?? "?")[0] ?? "?"}
                />
              </div>

              {/* Info */}
              <div className="mb-4">
                <h3 className="font-semibold text-[hsl(var(--foreground))]">
                  {profileQuery.data?.displayName || "Unknown"}
                </h3>
                <p className="text-sm text-[hsl(var(--foreground)/0.6)]">
                  @{profileQuery.data?.username || "unknown"}
                </p>
                {profileQuery.data?.customStatus && (
                  <p className="mt-1 text-xs text-[hsl(var(--foreground)/0.5)]">
                    {profileQuery.data.customStatus}
                  </p>
                )}
                {profileQuery.data?.bio && (
                  <p className="mt-2 text-sm text-[hsl(var(--foreground)/0.7)]">
                    {profileQuery.data.bio}
                  </p>
                )}
              </div>

              {/* Member Since & Server Nickname */}
              <div className="space-y-1 border-t border-[hsl(var(--border))] py-3 text-xs text-[hsl(var(--foreground)/0.6)]">
                <div>
                  {t("profile.memberSince", {
                    date: new Date(profileQuery.data?.createdAt ?? 0).toLocaleDateString(),
                  })}
                </div>
                {serverId && profileQuery.data?.serverNickname && (
                  <div>
                    {t("profile.serverNickname")}: {profileQuery.data.serverNickname}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {!isSelf && <ActionButtons state={relationshipState} userId={userId} onSetBlockedByThem={setBlockedByThem} />}
              {isSelf && (
                <div className="mt-4 text-center text-sm text-[hsl(var(--foreground)/0.6)]">
                  This is you
                </div>
              )}
            </div>
          </motion.div>,
          document.body,
        )}
    </>
  );
}

function ActionButtons({
  state,
  userId,
  onSetBlockedByThem,
}: {
  state: RelationshipState;
  userId: string;
  onSetBlockedByThem: (blocked: boolean) => void;
}) {
  const { t } = useI18n();

  const profileQuery = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/users/${userId}/profile`);
      return res.json() as Promise<UserProfileData>;
    },
  });

  if (state === "loading") {
    return <div className="mt-4 h-10 animate-pulse rounded bg-[hsl(var(--border))]" />;
  }

  if (state === "blocked_by_them") {
    return (
      <div className="mt-4 text-center text-sm text-[hsl(var(--foreground)/0.6)]">
        {t("profile.blockedByThem")}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {state === "not_friends" && (
        <>
          <AddFriendButton
            username={profileQuery.data?.username || ""}
            userId={userId}
            onError={(code) => {
              if (code === "BLOCKED") onSetBlockedByThem(true);
            }}
          />
          <MessageButton userId={userId} />
        </>
      )}

      {typeof state === "object" && state.type === "request_sent" && (
        <>
          <CancelRequestButton requestId={state.requestId} />
          <MessageButton userId={userId} />
        </>
      )}

      {typeof state === "object" && state.type === "request_received" && (
        <>
          <AcceptDeclineButtons requestId={state.requestId} />
          <MessageButton userId={userId} />
        </>
      )}

      {state === "friends" && (
        <>
          <MessageButton userId={userId} />
          <RemoveFriendButton userId={userId} />
        </>
      )}

      {state === "blocked_by_me" && (
        <UnblockButton userId={userId} />
      )}
    </div>
  );
}

function AddFriendButton({
  username,
  userId,
  onError,
}: {
  username?: string;
  userId: string;
  onError: (code?: string) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => sendFriendRequestRequest(username || ""),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.pending });
      const prev = queryClient.getQueryData(friendsQueryKeys.pending);
      queryClient.setQueryData(friendsQueryKeys.pending, (old: PendingFriendsResponse | undefined) => ({
        ...old,
        outgoing: [...(old?.outgoing || []), { id: "temp", receiverId: userId }],
      }));
      return { prev };
    },
    onError: (error: Error, _, ctx) => {
      queryClient.setQueryData(friendsQueryKeys.pending, ctx?.prev);
      const code = error instanceof FriendsClientError ? error.code : undefined;
      onError(code);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.pending });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="w-full rounded bg-[hsl(var(--primary))] px-3 py-2 font-medium text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
    >
      {mutation.isPending ? "..." : t("profile.addFriend")}
    </button>
  );
}

function CancelRequestButton({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => cancelFriendRequestRequest(requestId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.pending });
      const prev = queryClient.getQueryData(friendsQueryKeys.pending);
      queryClient.setQueryData(friendsQueryKeys.pending, (old: PendingFriendsResponse | undefined) => ({
        ...old,
        outgoing: old?.outgoing?.filter((r) => r.id !== requestId) || [],
      }));
      return { prev };
    },
    onError: (_, __, ctx) => {
      queryClient.setQueryData(friendsQueryKeys.pending, ctx?.prev);
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="w-full rounded border border-[hsl(var(--border))] px-3 py-2 font-medium transition hover:bg-[hsl(var(--surface-hover))] disabled:opacity-50"
    >
      {mutation.isPending ? "..." : t("profile.cancelRequest")}
    </button>
  );
}

function AcceptDeclineButtons({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "accept"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.pending });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.list });
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => actOnFriendRequestRequest(requestId, "decline"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.pending });
    },
  });

  return (
    <div className="flex gap-2">
      <button
        onClick={() => acceptMutation.mutate()}
        disabled={acceptMutation.isPending || declineMutation.isPending}
        className="flex-1 rounded bg-[hsl(var(--primary))] px-3 py-2 font-medium text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
      >
        {acceptMutation.isPending ? "..." : t("profile.accept")}
      </button>
      <button
        onClick={() => declineMutation.mutate()}
        disabled={acceptMutation.isPending || declineMutation.isPending}
        className="flex-1 rounded border border-[hsl(var(--border))] px-3 py-2 font-medium transition hover:bg-[hsl(var(--surface-hover))] disabled:opacity-50"
      >
        {declineMutation.isPending ? "..." : t("profile.decline")}
      </button>
    </div>
  );
}

function RemoveFriendButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => removeFriendRequest(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.list });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="w-full rounded border border-[hsl(var(--destructive))] px-3 py-2 font-medium text-[hsl(var(--destructive))] transition hover:bg-[hsl(var(--destructive)/0.1)] disabled:opacity-50"
    >
      {mutation.isPending ? "..." : t("profile.removeFriend")}
    </button>
  );
}

function UnblockButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => unblockFriendRequest(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.blocked });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="w-full rounded bg-[hsl(var(--primary))] px-3 py-2 font-medium text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
    >
      {mutation.isPending ? "..." : t("profile.unblock")}
    </button>
  );
}

function MessageButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: () => createDMConversationRequest(userId),
    onSuccess: (conversation) => {
      router.push(`/channels/@me/${conversation.id}`);
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="w-full rounded border border-[hsl(var(--primary))] px-3 py-2 font-medium text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.1)] disabled:opacity-50"
    >
      {mutation.isPending ? "..." : t("profile.message")}
    </button>
  );
}
