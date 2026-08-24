"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DMConversationDTO } from "@wizards/types";
import { sumDMUnreadCount } from "@/lib/dm/unread";
import { HOME_STALE_TIME_MS, fetchHomeSummary, homeQueryKeys } from "@/lib/home/client";

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

export function useUnreadCounters({
  conversations,
  currentUserId,
}: UseUnreadCountersInput): UnreadCounters {
  const summary = useQuery({
    queryFn: fetchHomeSummary,
    queryKey: homeQueryKeys.summary,
    staleTime: HOME_STALE_TIME_MS.summary,
  });
  const mentions = summary.data?.unreadMentions ?? 0;

  return useMemo(
    () => ({
      dm: sumDMUnreadCount(conversations, currentUserId),
      mentions,
    }),
    [conversations, currentUserId, mentions],
  );
}
