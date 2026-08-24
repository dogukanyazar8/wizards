"use client";

import React from "react";
import { usePathname } from "next/navigation";

import { MessagesRail } from "@/components/messages/messages-rail";
import { useConversationRows } from "@/hooks/use-conversation-rows";
import { useDMConversations } from "@/hooks/use-dm-conversations";
import { useUnreadCounters } from "@/hooks/use-unread-counters";
import { useUiScaleStep } from "@/hooks/use-ui-scale-step";
import { selectMessagesDensity } from "@/lib/messages/density";
import { MESSAGES_FRIENDS_ROUTE, selectActiveConversationId } from "@/lib/messages/routes";

/**
 * Sohbet rayının veri katmanı — SPEC §3.
 *
 * Kabuk rayı **çizmez**, yalnız üçüncü sütuna yerleştirir; bu bileşen veriyi
 * çeker. Ayrım şundan: `useDMConversations` bir sohbet ekranı bağımlılığıdır ve
 * kabuğun her rotada onu açması, Ana Sayfa'da hiç kullanılmayan bir sorgu olurdu.
 *
 * Başlıktaki toplam okunmamış `useUnreadCounters`'tan gelir — gezinme
 * panelindeki `Mesajlar` rozetiyle **aynı** hook. PROMPT'un tek entegrasyon
 * şartı bu.
 */

export type MessagesRailContainerProps = {
  currentUserId: string;
  onNavigate: (href: string) => void;
};

export function MessagesRailContainer({ currentUserId, onNavigate }: MessagesRailContainerProps) {
  const pathname = usePathname();
  const scale = useUiScaleStep();
  const { conversations } = useDMConversations(currentUserId);
  const { isLoading, rows } = useConversationRows(currentUserId);
  const unread = useUnreadCounters({ conversations, currentUserId });

  // Ray kabuğun üçüncü sütununda, `/messages/[conversationId]` ağacının **içinde
  // değil**; oradan `useParams` boş gelir. Aktif kimlik yoldan okunuyor.
  const activeConversationId = selectActiveConversationId(pathname);

  return (
    <MessagesRail
      activeConversationId={activeConversationId}
      loading={isLoading}
      // Arkadaşlar rotası `dmAction=group` niyetini gerçek grup modalına bağlar.
      // `new` ayrı kişi-seçici akışıdır ve bu değişikliğin kapsamı dışındadır.
      onNewGroup={() => onNavigate(`${MESSAGES_FRIENDS_ROUTE}?dmAction=group`)}
      onNewMessage={() => onNavigate(`${MESSAGES_FRIENDS_ROUTE}?dmAction=new`)}
      rowCount={selectMessagesDensity(scale).railRows}
      rows={rows}
      unreadTotal={unread.dm}
    />
  );
}
