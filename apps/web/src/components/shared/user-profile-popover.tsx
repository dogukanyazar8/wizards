"use client";
import { UserGameActivity } from "./user-game-activity";
import { profileStatusRefetchInterval } from "@wizards/types";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/avatar";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { useI18n } from "@/components/providers/locale-provider";
import { ProfileBadgeChips } from "@/components/shared/profile-badge-chips";
import {
  ProfileBadgeDetail,
  type ProfileBadgeDetailRequest,
} from "@/components/shared/profile-badge-detail";
import {
  badgeQueryKeys,
  fetchOwnBadges,
  fetchUserBadges,
  BADGE_QUERY_STALE_TIME_MS,
} from "@/lib/badges/client";
import { cn } from "@/lib/utils";
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
import { buildLegacySettingsHref } from "@/lib/settings/navigation";
import type { FriendDto, PendingFriendsResponse } from "@/lib/friends/types";

interface UserProfileData {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  bannerColor: string | null;
  bannerOffsetX: number | null;
  bannerOffsetY: number | null;
  bannerUrl: string | null;
  customStatus: string | null;
  customStatusEmoji: string | null;
  customStatusExpiresAt: string | null;
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
  testId?: string;
  children: React.ReactNode;
};

export function UserProfilePopover({
  userId,
  currentUserId,
  serverId,
  testId,
  children,
}: UserProfilePopoverProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [blockedByThem, setBlockedByThem] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

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
    refetchInterval: (query) =>
      open ? profileStatusRefetchInterval(query.state.data?.customStatusExpiresAt) : false,
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

  /**
   * Badges are a second read, deliberately not folded into the profile query:
   * they change rarely, so they carry the shared 5 minute freshness window
   * (03 §4) while the profile keeps its own. The row below holds its height
   * until this settles, so the popover does not jump when it lands.
   */
  const isBlocked =
    relationshipState === "blocked_by_me" || relationshipState === "blocked_by_them";

  const badgesQuery = useQuery({
    queryKey: badgeQueryKeys.user(userId),
    queryFn: () => fetchUserBadges(userId),
    enabled: open && !isBlocked,
    staleTime: BADGE_QUERY_STALE_TIME_MS,
  });

  /**
   * 06 §3/§4. The detail panel replaces the popover's body; the badges it shows
   * are the ones already loaded above, so opening it costs no request. The one
   * exception is your own progress, which is fetched only on your own profile
   * and only while the panel is open — never on a peer's, where a counter would
   * leak how they use the app (00 §4).
   */
  const [badgeRequest, setBadgeRequest] = useState<ProfileBadgeDetailRequest | null>(null);

  const ownBadgesQuery = useQuery({
    queryKey: badgeQueryKeys.own(),
    queryFn: fetchOwnBadges,
    enabled: isSelf && badgeRequest !== null,
    staleTime: BADGE_QUERY_STALE_TIME_MS,
  });

  const closePopover = useCallback(() => {
    setBadgeRequest(null);
    setOpen(false);
  }, []);

  /**
   * 07 §3. On your own profile the `+N` chip is a shortcut to "Rozetlerim",
   * which is the full list plus your progress; on somebody else's it stays the
   * in-popover list, because their progress is not yours to read (06 §1).
   */
  const openBadgeOverflow = () => {
    if (isSelf) {
      closePopover();
      router.push(buildLegacySettingsHref("account", "badges"));
      return;
    }

    setBadgeRequest({ kind: "list" });
  };

  const openPopover = () => {
    if (!triggerRef.current) return;
    setOpen(true);
  };

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const trigger = triggerRef.current;
    if (!open || !popover || !trigger) return;
    if (isMobileViewport) {
      popover.style.removeProperty("left");
      popover.style.removeProperty("top");
      return;
    }

    const positionPopover = () => {
      const rect = trigger.getBoundingClientRect();
      const topInset =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--app-viewport-top"),
        ) || 0;
      const width = popover.offsetWidth;
      const x =
        rect.right + width + 12 <= window.innerWidth ? rect.right + 12 : rect.left - width - 12;
      popover.style.left = `${Math.max(12, Math.min(x, window.innerWidth - width - 12))}px`;
      popover.style.top = `${Math.max(topInset + 12, Math.min(rect.top, window.innerHeight - popover.offsetHeight - 12))}px`;
    };
    positionPopover();
    const observer = new ResizeObserver(positionPopover);
    observer.observe(popover);
    window.addEventListener("resize", positionPopover);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionPopover);
    };
  }, [open, isMobileViewport]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handler = (e: PointerEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      closePopover();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
      }
    };

    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closePopover, open]);

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
        data-testid={testId}
        className="cursor-pointer rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
      >
        {children}
      </div>

      {open &&
        createPortal(
          <>
            {isMobileViewport ? (
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[90] bg-[hsl(var(--background)/0.58)] backdrop-blur-xs"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                onClick={closePopover}
              />
            ) : null}
            <motion.div
              ref={popoverRef}
              // 06 §3 assumes the popover is already a dialog; it was not, and
              // the inline badge panel needs that shell to be one so the
              // aria-live region inside it is announced within a named surface
              // instead of loose in the document.
              aria-label={profileQuery.data?.displayName ?? t("profile.badges.title")}
              role="dialog"
              data-testid="user-profile-popover"
              className={cn(
                "fixed z-[91] max-h-[calc(100dvh-var(--app-viewport-top,0px)-24px)] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain border border-[hsl(var(--border)/0.88)] bg-[hsl(var(--surface-overlay)/0.98)] shadow-[0_28px_80px_hsl(var(--shadow-color)/0.28)] backdrop-blur-2xl",
                isMobileViewport
                  ? "inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] rounded-[30px]"
                  : "w-80 rounded-[30px]",
              )}
              initial={
                isMobileViewport ? { opacity: 0, y: 28 } : { opacity: 0, scale: 0.95, y: -8 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={isMobileViewport ? { opacity: 0, y: 28 } : { opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <WindowCloseButton
                aria-label={t("common.close")}
                className="absolute right-3 top-3 z-10 bg-[hsl(var(--surface-overlay)/0.84)] backdrop-blur"
                onClick={closePopover}
              />

              <div
                className="h-24 w-full bg-[linear-gradient(135deg,hsl(var(--primary)/0.28),hsl(var(--ambient-2)/0.2),hsl(var(--surface-soft)/0.6))]"
                style={{
                  backgroundColor: profileQuery.data?.bannerColor ?? undefined,
                  backgroundImage: profileQuery.data?.bannerUrl
                    ? `url(${JSON.stringify(profileQuery.data.bannerUrl)})`
                    : profileQuery.data?.bannerColor
                      ? "none"
                      : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: `${(profileQuery.data?.bannerOffsetX ?? 0.5) * 100}% ${(profileQuery.data?.bannerOffsetY ?? 0.5) * 100}%`,
                }}
              />

              {badgeRequest ? (
                <div className="relative px-4 pb-4 pt-4">
                  <ProfileBadgeDetail
                    badges={badgesQuery.data?.badges ?? []}
                    isSelf={isSelf}
                    onBack={() => setBadgeRequest(null)}
                    progress={ownBadgesQuery.data?.progress ?? null}
                    request={badgeRequest}
                  />
                </div>
              ) : (
                <div className="relative px-4 pb-4">
                  {/*
                  1a puts the badge row on the avatar line, pushed to its right
                  edge. `flex-wrap` is what keeps that promise on a narrow
                  desktop window: the row drops under the avatar instead of the
                  chips shrinking away from the 28px the mock fixes them at.
                */}
                  <div className="-mt-11 mb-3 flex flex-wrap items-end justify-between gap-3">
                    <Avatar
                      src={profileQuery.data?.avatarUrl}
                      alt={profileQuery.data?.displayName || "User"}
                      className="h-20 w-20 border-4 border-[hsl(var(--surface-card))]"
                      fallback={(profileQuery.data?.displayName ?? "?")[0] ?? "?"}
                    />
                    {isBlocked ? null : (
                      <ProfileBadgeChips
                        badges={badgesQuery.data?.badges ?? []}
                        loading={badgesQuery.isPending}
                        onSelectBadge={(badge) =>
                          setBadgeRequest({ badgeId: badge.id, kind: "badge" })
                        }
                        onSelectOverflow={openBadgeOverflow}
                      />
                    )}
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
                        {profileQuery.data.customStatusEmoji
                          ? `${profileQuery.data.customStatusEmoji} `
                          : ""}
                        {profileQuery.data.customStatus}
                      </p>
                    )}
                    {profileQuery.data?.bio && (
                      <p className="mt-2 text-sm leading-6 text-app-muted">
                        {profileQuery.data.bio}
                      </p>
                    )}
                    {!isBlocked && <UserGameActivity userId={userId} />}
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

                  {!isSelf && (
                    <ActionButtons
                      state={relationshipState}
                      userId={userId}
                      onSetBlockedByThem={setBlockedByThem}
                    />
                  )}
                  {isSelf && (
                    <div className="mt-4 text-center text-sm text-app-muted">This is you</div>
                  )}
                </div>
              )}
            </motion.div>
          </>,
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
      <div className="mt-4 text-center text-sm text-app-muted">{t("profile.blockedByThem")}</div>
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

      {state === "blocked_by_me" && <UnblockButton userId={userId} />}
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
      queryClient.setQueryData(
        friendsQueryKeys.pending,
        (old: PendingFriendsResponse | undefined) => ({
          ...old,
          outgoing: [...(old?.outgoing || []), { id: "temp", receiverId: userId }],
        }),
      );
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
      queryClient.setQueryData(
        friendsQueryKeys.pending,
        (old: PendingFriendsResponse | undefined) => ({
          ...old,
          outgoing: old?.outgoing?.filter((r) => r.id !== requestId) || [],
        }),
      );
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
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation<
    { success: true },
    Error,
    void,
    { previousFriends: FriendDto[] | undefined }
  >({
    mutationFn: () => removeFriendRequest(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.list });
      const previousFriends = queryClient.getQueryData<FriendDto[]>(friendsQueryKeys.list);
      queryClient.setQueryData<FriendDto[] | undefined>(friendsQueryKeys.list, (current) =>
        current?.filter((friend) => friend.id !== userId),
      );
      setError(null);

      return { previousFriends };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousFriends) {
        queryClient.setQueryData(friendsQueryKeys.list, context.previousFriends);
      }
      setError(t("friends.remove.error"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
    },
  });

  return (
    <div className="space-y-2">
      {error ? (
        <p
          className="rounded-2xl border border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-xs font-medium text-app-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="w-full rounded-2xl border border-[hsl(var(--danger)/0.38)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-sm font-semibold text-app-danger transition hover:bg-[hsl(var(--danger)/0.14)] disabled:opacity-50"
      >
        {mutation.isPending ? "..." : t("profile.removeFriend")}
      </button>
    </div>
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
      router.push(`/messages/${conversation.id}`);
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
