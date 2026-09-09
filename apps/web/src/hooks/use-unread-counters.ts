"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DMConversationDTO, MentionCounts } from "@wizards/types";
import { useSocket } from "@/hooks/use-socket";
import { sumDMUnreadCount } from "@/lib/dm/unread";
import { HOME_STALE_TIME_MS, fetchHomeSummary, homeQueryKeys } from "@/lib/home/client";
import type { AppSummaryResponse } from "@/lib/home/types";
import type { NotificationSocketPayload } from "@/lib/socket/events";

/**
 * Kabuğun rozet sayaçları — `03-faz2-kabuk-nav-paneli.md` §4.
 *
 * Ana Sayfa ile Mesajlar aynı sayıyı göstermek zorunda (PROMPT §9). Hesap tek yerde: yüzeyler
 * kendi `reduce`'unu yazmaz, bu hook'u çağırır.
 *
 * **Sunucu okunmamışı burada yok** — bilerek. Sunucu satırlarının sayacı `server:unread:update`
 * olayının yazdığı `workspaceQueryKeys.servers` query verisinde durur (`applyServerUnreadCount`);
 * onu ikinci bir yapıya kopyalamak tam da bu §'nin yasakladığı ikinci kaynağı yaratırdı. Ray ve
 * panel `WorkspaceServerSummary.unreadCount` alanını doğrudan okur.
 */
export type UnreadCounters = {
  /** Tüm DM ve grup konuşmalarında izleyicinin okumadığı mesaj sayısı. */
  dm: number;
  /**
   * `GET /api/v1/app/summary` → `unreadMentions`. Kabuk her rotada bu sorgunun abonesidir; Ana
   * Sayfa **aynı** anahtarı kullandığı için ikinci bir istek çıkmaz (React Query tekilleştirir).
   */
  mentions: number;
};

export type UseUnreadCountersInput = {
  conversations: readonly DMConversationDTO[];
  currentUserId: string;
};

export function applyMentionCountsToSummary(
  current: AppSummaryResponse | undefined,
  counts: MentionCounts,
): AppSummaryResponse | undefined {
  return current ? { ...current, unreadMentions: counts.unread } : current;
}

export function isMentionNotification(payload: Pick<NotificationSocketPayload, "type">): boolean {
  return payload.type === "MENTION";
}

export function useUnreadCounters({
  conversations,
  currentUserId,
}: UseUnreadCountersInput): UnreadCounters {
  const queryClient = useQueryClient();
  const socket = useSocket();
  const summary = useQuery({
    queryFn: fetchHomeSummary,
    queryKey: homeQueryKeys.summary,
    staleTime: HOME_STALE_TIME_MS.summary,
  });

  useEffect(() => {
    const applyCounts = (payload: { counts: MentionCounts }) => {
      queryClient.setQueryData<AppSummaryResponse | undefined>(homeQueryKeys.summary, (current) =>
        applyMentionCountsToSummary(current, payload.counts),
      );
    };
    const refreshMentionCount = (payload: NotificationSocketPayload) => {
      if (isMentionNotification(payload)) {
        void queryClient.invalidateQueries({ queryKey: homeQueryKeys.summary });
      }
    };

    socket.on("mention:new", applyCounts);
    socket.on("mention:state", applyCounts);
    socket.on("mention:read-all", applyCounts);
    socket.on("notification:new", refreshMentionCount);

    return () => {
      socket.off("mention:new", applyCounts);
      socket.off("mention:state", applyCounts);
      socket.off("mention:read-all", applyCounts);
      socket.off("notification:new", refreshMentionCount);
    };
  }, [queryClient, socket]);

  const mentions = summary.data?.unreadMentions ?? 0;

  return useMemo(
    () => ({
      dm: sumDMUnreadCount(conversations, currentUserId),
      mentions,
    }),
    [conversations, currentUserId, mentions],
  );
}
