"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { friendsQueryKeys } from "@/lib/friends/client";
import type { FriendDto, FriendVoiceRoomDto } from "@/lib/friends/types";
import { homeQueryKeys } from "@/lib/home/client";
import type { VoiceAudioLevelPayload } from "@/lib/socket/events";
import type { AppSummaryResponse, HomePresence, VoiceLiveResponse } from "@/lib/home/types";

import { useSocket } from "./use-socket";

/**
 * Ana Sayfa 1a — Faz 3 §6. The home screen's single socket subscription.
 *
 * Three rules:
 * 1. **Patch before invalidate.** An event that carries the new value writes it
 *    into the cache; only an event that changes the *shape* of a list forces a
 *    refetch.
 * 2. **Audio levels never touch React Query.** `voice:audio-level:update` fires
 *    many times a second; it lands in local state, coalesced to one update per
 *    animation frame.
 * 3. **No new socket events.** Everything here already existed (§3.9).
 */

export type HomeAudioLevels = Readonly<Record<string, number>>;

export function applyPresenceToSummary(
  current: AppSummaryResponse | undefined,
  update: { status: HomePresence; userId: string },
  viewerId: string,
): AppSummaryResponse | undefined {
  if (!current || update.userId !== viewerId) {
    return current;
  }

  // A friend's presence never changes the viewer's own header; only their own
  // does, and then the focus pill has to follow the status it is derived from.
  return {
    ...current,
    focus: update.status === "DND" ? current.focus : null,
    presence: update.status,
  };
}

export function applyPresenceToLiveRooms(
  current: VoiceLiveResponse | undefined,
  update: { status: HomePresence; userId: string },
): VoiceLiveResponse | undefined {
  if (!current) {
    return current;
  }

  return {
    ...current,
    rooms: current.rooms.map((room) => ({
      ...room,
      participants: room.participants.map((participant) =>
        participant.id === update.userId
          ? { ...participant, presence: update.status }
          : participant,
      ),
    })),
  };
}

/**
 * Ana Sayfa §4.6 — the friends strip's status line reads `voiceRoom`, and this
 * event carries the new value, so it is patched rather than refetched (rule 1).
 * The friend list is a shared query key; a refetch here would cost every surface
 * that renders it.
 */
export function applyFriendVoiceRoom(
  current: FriendDto[] | undefined,
  update: { userId: string; voiceRoom: FriendVoiceRoomDto | null },
): FriendDto[] | undefined {
  if (!current) {
    return current;
  }

  return current.map((friend) =>
    friend.id === update.userId ? { ...friend, voiceRoom: update.voiceRoom } : friend,
  );
}

function patchEveryMatchingQuery<TData>(
  queryClient: QueryClient,
  prefix: readonly unknown[],
  updater: (current: TData | undefined) => TData | undefined,
): void {
  queryClient.setQueriesData<TData>({ queryKey: prefix }, updater);
}

export type UseHomeRealtimeInput = {
  viewerId: string;
};

export function useHomeRealtime({ viewerId }: UseHomeRealtimeInput) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const [audioLevels, setAudioLevels] = useState<HomeAudioLevels>({});
  const pendingLevels = useRef<Record<string, number>>({});
  const frame = useRef<number | null>(null);

  const flushLevels = useCallback(() => {
    frame.current = null;
    const pending = pendingLevels.current;
    pendingLevels.current = {};
    setAudioLevels((current) => ({ ...current, ...pending }));
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const invalidate = (queryKey: readonly unknown[]) => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const onPresence = (data: {
      customStatus: string | null;
      status: HomePresence;
      userId: string;
    }) => {
      patchEveryMatchingQuery<AppSummaryResponse>(queryClient, homeQueryKeys.summary, (current) =>
        applyPresenceToSummary(current, data, viewerId),
      );
      patchEveryMatchingQuery<VoiceLiveResponse>(queryClient, ["home", "live"], (current) =>
        applyPresenceToLiveRooms(current, data),
      );
    };

    // Membership of a room changed — that is a shape change, not a value change.
    const onVoiceState = () => invalidate(["home", "live"]);
    const onFriendsVoice = (data: { userId: string; voiceRoom: FriendVoiceRoomDto | null }) => {
      patchEveryMatchingQuery<FriendDto[]>(queryClient, friendsQueryKeys.list, (current) =>
        applyFriendVoiceRoom(current, data),
      );
      invalidate(["home", "live"]);
    };
    const onFriendsUpdated = () => invalidate(["home", "live"]);
    const onNotification = () => {
      invalidate(["home", "awaiting"]);
      invalidate(homeQueryKeys.summary);
    };
    const onUnread = () => {
      invalidate(["home", "recent"]);
      invalidate(homeQueryKeys.summary);
    };

    const onAudioLevel = (data: VoiceAudioLevelPayload) => {
      // Muted is silence regardless of what the meter says.
      pendingLevels.current[data.userId] = data.isMuted ? 0 : data.audioLevel;
      if (frame.current !== null) {
        return;
      }

      frame.current =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(flushLevels)
          : (setTimeout(flushLevels, 16) as unknown as number);
    };

    socket.on("presence:update", onPresence);
    socket.on("friends:updated", onFriendsUpdated);
    socket.on("friends:voice:update", onFriendsVoice);
    socket.on("voice:state:update", onVoiceState);
    socket.on("voice:audio-level:update", onAudioLevel);
    socket.on("notification:new", onNotification);
    socket.on("server:unread:update", onUnread);
    socket.on("dm:conversation:updated", onUnread);

    return () => {
      socket.off("presence:update", onPresence);
      socket.off("friends:updated", onFriendsUpdated);
      socket.off("friends:voice:update", onFriendsVoice);
      socket.off("voice:state:update", onVoiceState);
      socket.off("voice:audio-level:update", onAudioLevel);
      socket.off("notification:new", onNotification);
      socket.off("server:unread:update", onUnread);
      socket.off("dm:conversation:updated", onUnread);

      if (frame.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame.current);
      }
      frame.current = null;
    };
  }, [flushLevels, queryClient, socket, viewerId]);

  return { audioLevels };
}
