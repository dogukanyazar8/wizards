"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";
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

  const openPopover = () => {
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

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={openPopover}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPopover();
          }
        }}
        role="button"
        tabIndex={0}
        className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      >
        {children}
      </div>

      {open && popoverPos &&
        createPortal(
          <motion.div
            ref={popoverRef}
            className="fixed z-[60] w-80 overflow-hidden rounded-[30px] border border-[hsl(var(--border)/0.88)] bg-[hsl(var(--surface-overlay)/0.98)] shadow-[0_28px_80px_hsl(var(--shadow-color)/0.28)] backdrop-blur-2xl"
            style={{ left: `${popoverPos.x}px`, top: `${popoverPos.y}px` }}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <button
              aria-label={t("common.close")}
              className="absolute right-3 top-3 z-10 rounded-full border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface-overlay)/0.84)] p-2 text-app-muted backdrop-blur transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div
              className="h-24 w-full bg-[linear-gradient(135deg,hsl(var(--primary)/0.28),hsl(var(--ambient-2)/0.2),hsl(var(--surface-soft)/0.6))]"
              style={{
                backgroundColor: profileQuery.data?.bannerColor ?? undefined,
                backgroundImage: profileQuery.data?.bannerUrl
                  ? `url(${profileQuery.data.bannerUrl})`
                  : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />

            <div className="relative px-4 pb-4">
              <div className="-mt-11 mb-3">
                <Avatar
                  src={profileQuery.data?.avatarUrl}
                  alt={profileQuery.data?.displayName || "User"}
                  className="h-20 w-20 border-4 border-[hsl(var(--surface-card))]"
                  fallback={(profileQuery.data?.displayName ?? "?")[0] ?? "?"}
                />
              </div>

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-app-foreground">
                  {profileQuery.data?.displayName || "Unknown"}
                </h3>
                <p className="text-sm text-app-muted">
                  @{profileQuery.data?.username || "unknown"}
                </p>
                {profileQuery.data?.customStatus && (
                  <p className="mt-2 rounded-2xl border border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface-soft)/0.42)] px-3 py-2 text-xs text-app-muted">
                    {profileQuery.data.customStatus}
                  </p>
                )}
                {profileQuery.data?.bio && (
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    {profileQuery.data.bio}
                  </p>
                )}
              </div>

              <div className="app-panel-soft space-y-1 rounded-[20px] border px-3 py-3 text-xs text-app-muted">
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

              {!isSelf && <ActionButtons state={relationshipState} userId={userId} onSetBlockedByThem={setBlockedByThem} />}
              {isSelf && (
                <div className="mt-4 text-center text-sm text-app-muted">
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
    return <div className="app-panel-soft mt-4 h-10 animate-pulse rounded-2xl border" />;
  }

  if (state === "blocked_by_them") {
    return (
      <div className="mt-4 text-center text-sm text-app-muted">
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
      className="w-full rounded-2xl bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
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
      className="w-full rounded-2xl border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--surface-soft)/0.38)] px-3 py-2 text-sm font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.64)] disabled:opacity-50"
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
        className="flex-1 rounded-2xl bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
      >
        {acceptMutation.isPending ? "..." : t("profile.accept")}
      </button>
      <button
        onClick={() => declineMutation.mutate()}
        disabled={acceptMutation.isPending || declineMutation.isPending}
        className="flex-1 rounded-2xl border border-[hsl(var(--border)/0.76)] bg-[hsl(var(--surface-soft)/0.38)] px-3 py-2 text-sm font-semibold text-app-foreground transition hover:bg-[hsl(var(--surface-soft)/0.64)] disabled:opacity-50"
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
      className="w-full rounded-2xl border border-[hsl(var(--danger)/0.38)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-sm font-semibold text-app-danger transition hover:bg-[hsl(var(--danger)/0.14)] disabled:opacity-50"
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
      className="w-full rounded-2xl bg-[hsl(var(--primary))] px-3 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:opacity-50"
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
      className="w-full rounded-2xl border border-[hsl(var(--primary)/0.36)] bg-[hsl(var(--primary)/0.1)] px-3 py-2 text-sm font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.16)] disabled:opacity-50"
    >
      {mutation.isPending ? "..." : t("profile.message")}
    </button>
  );
}
