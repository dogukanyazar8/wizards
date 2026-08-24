"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useVoiceState } from "@/components/providers/voice-provider";
import { useDMCallActions } from "@/components/providers/dm-call-provider";
import { createDMConversationRequest, dmQueryKeys } from "@/lib/dm/client";
import { actOnFriendRequestRequest } from "@/lib/friends/client";
import type { FriendDto } from "@/lib/friends/types";
import { homeQueryKeys, joinServerByInvite, setHomeEventInterest } from "@/lib/home/client";
import { HOME_FRIENDS_HREF } from "@/lib/home/href";
import { createAcceptAwaitingMutation, createEventInterestMutation } from "@/lib/home/mutations";
import { clearRecentUnread } from "@/lib/home/optimistic";
import type {
  AppAwaitingFilter,
  AppRecentResponse,
  HomeAwaitingItem,
  HomeLiveRoom,
} from "@/lib/home/types";

/**
 * Ana Sayfa 1a — Faz 5. Every write the screen can start, in one place.
 *
 * The decisions all live in pure modules (`mutations`, `optimistic`); this hook
 * is the wiring: it hands them a `QueryClient`, the existing endpoints, and the
 * existing voice/DM-call flows. It writes no join path and no accept endpoint of
 * its own.
 *
 * Presence and focus are **not** here: they belong to `FocusControlsProvider`,
 * because the shell's user footer and the command palette read the same layer
 * from outside this screen (§3.3).
 */

/** i18n: `home.errors.*` — one short line per card (§2, "kullanıcıya söyle"). */
const ERROR_TEXT = {
  accept: "Kabul edilemedi, tekrar dene",
  join: "Odaya bağlanılamadı",
  message: "Sohbet açılamadı",
  remind: "Hatırlatıcı kurulamadı",
} as const;

export type HomeCardErrorKey = keyof typeof ERROR_TEXT;

/** Mevcut web geri bildirim şeridiyle aynı ömür (`friends-view.tsx`). */
const NOTICE_LIFETIME_MS = 5_000;

export type HomeActions = ReturnType<typeof useHomeActions>;

export function useHomeActions(input: {
  awaitingLimit: number;
  /** Faz 6 — Gelen kutusu filtreliyken iyimser yazım **kendi** sayfasını yamalar. */
  awaitingSource?: AppAwaitingFilter;
  recentLimit: number;
  upcomingLimit: number;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { activeChannelId, activeConversationId, isJoining, joinChannel, leaveChannel } =
    useVoiceState();
  const { joinOngoingCall, startCall } = useDMCallActions();

  const awaitingKey = useMemo(
    () => homeQueryKeys.awaiting(input.awaitingLimit, input.awaitingSource ?? "all"),
    [input.awaitingLimit, input.awaitingSource],
  );
  const upcomingKey = useMemo(
    () => homeQueryKeys.upcoming(input.upcomingLimit),
    [input.upcomingLimit],
  );
  const recentKey = useMemo(() => homeQueryKeys.recent(input.recentLimit), [input.recentLimit]);

  const [notices, setNotices] = useState<Partial<Record<HomeCardErrorKey, string>>>({});

  const notify = useCallback((key: HomeCardErrorKey) => {
    setNotices((current) => ({ ...current, [key]: ERROR_TEXT[key] }));
  }, []);

  /**
   * The lines clear themselves after a few seconds — the same lifetime the
   * existing web feedback strip uses (`friends-view.tsx`). One timer for the set
   * rather than one per key: a second failure while the first line is still up
   * simply restarts the shared window.
   */
  useEffect(() => {
    if (Object.keys(notices).length === 0) {
      return;
    }

    const handle = setTimeout(() => setNotices({}), NOTICE_LIFETIME_MS);

    return () => clearTimeout(handle);
  }, [notices]);

  const accept = useMutation(
    createAcceptAwaitingMutation({
      acceptFriendRequest: (requestId) => actOnFriendRequestRequest(requestId, "accept"),
      awaitingKey,
      joinServerByInvite,
      onFailure: () => notify("accept"),
      onJoined: (href) => router.push(href),
      queryClient,
    }),
  );

  /**
   * Ş10 — Faz 6'nın `eventsListKey` bağı kalktı: eski Etkinlikler listesi silindi ve
   * `Hatırlat` artık yalnız "Sıradaki" kartının kendi anahtarını yamalıyor. `createEventInterestMutation`
   * ikinci anahtarı **opsiyonel** tutuyor, o yüzden mutasyonun kendisi değişmedi.
   */
  const interest = useMutation(
    createEventInterestMutation({
      onFailure: () => notify("remind"),
      queryClient,
      setInterest: setHomeEventInterest,
      upcomingKey,
    }),
  );

  const openDirectMessage = useMutation({
    mutationFn: (friendUserId: string) => createDMConversationRequest(friendUserId),
    onError: () => notify("message"),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: dmQueryKeys.list });
      router.push(`/messages/${conversation.id}`);
    },
  });

  /**
   * §6 — "Sesli ara". The conversation is resolved with the same endpoint the
   * friends view uses, then the ring is handed to the DM call controller. No
   * second call lifecycle is started here.
   */
  const callFriend = useMutation({
    mutationFn: async (friend: FriendDto) => {
      const conversation = await createDMConversationRequest(friend.id);

      await startCall({
        conversationId: conversation.id,
        peer: {
          avatarUrl: friend.avatarUrl ?? null,
          displayName: friend.displayName ?? null,
          id: friend.id,
          username: friend.username,
        },
        video: false,
      });

      router.push(`/messages/${conversation.id}`);
    },
    onError: () => notify("message"),
  });

  /**
   * §4 — `Katıl` calls the flow that already exists. A voice channel goes
   * through `joinChannel`; a group call goes through the DM call controller,
   * which is the only thing allowed to touch that lifecycle. Switching rooms is
   * whatever `joinVoiceSession` already does (it leaves the old one first) —
   * there is no new confirmation dialog here.
   */
  const joinRoom = useMutation({
    mutationFn: async (room: HomeLiveRoom) => {
      if (room.kind === "call") {
        await joinOngoingCall({ conversationId: room.id });
        return;
      }

      if (!room.serverId) {
        throw new Error(`Voice room ${room.id} has no server`);
      }

      await joinChannel({ channelId: room.id, serverId: room.serverId });
    },
    onError: () => notify("join"),
  });

  const leaveRoom = useMutation({
    mutationFn: () => leaveChannel(),
    onError: () => notify("join"),
  });

  return {
    accept: {
      /** §2.2 — the same row cannot be accepted twice. */
      isPending: (id: string) => accept.isPending && accept.variables?.id === id,
      run: (item: HomeAwaitingItem) => {
        if (accept.isPending) {
          return;
        }

        accept.mutate(item);
      },
    },
    /** §2.4 — the badge clears before the navigation; the target screen marks it read. */
    markRecentRead: (id: string) => {
      queryClient.setQueryData<AppRecentResponse>(recentKey, (current) =>
        clearRecentUnread(current, id),
      );
    },
    notices,
    friends: {
      call: (friend: FriendDto) => {
        if (callFriend.isPending) {
          return;
        }

        callFriend.mutate(friend);
      },
      message: (friend: FriendDto) => {
        if (openDirectMessage.isPending) {
          return;
        }

        openDirectMessage.mutate(friend.id);
      },
      /**
       * Web'de ayrı bir profil rotası yok; kişi kartı arkadaşlar yüzeyinde açılıyor.
       * `search/command` de aynı hedefi üretiyor (`href.ts: HOME_FRIENDS_HREF`), ikinci bir
       * geçici hedef uydurulmadı.
       */
      profile: (friend: FriendDto) => {
        router.push(`${HOME_FRIENDS_HREF}?user=${encodeURIComponent(friend.id)}`);
      },
    },
    remind: {
      isPending: interest.isPending,
      run: (variables: { eventId: string; interested: boolean; serverId: string }) => {
        if (interest.isPending) {
          return;
        }

        interest.mutate(variables);
      },
    },
    voice: {
      /** SPEC §6 — read from the voice context; the screen keeps no copy. */
      joinedRoomId: activeChannelId ?? activeConversationId,
      isBusy: joinRoom.isPending || leaveRoom.isPending || isJoining,
      join: (room: HomeLiveRoom) => {
        if (joinRoom.isPending || leaveRoom.isPending || isJoining) {
          return;
        }

        joinRoom.mutate(room);
      },
      leave: () => {
        if (joinRoom.isPending || leaveRoom.isPending) {
          return;
        }

        leaveRoom.mutate();
      },
    },
  };
}
