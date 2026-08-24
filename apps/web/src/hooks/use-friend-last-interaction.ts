"use client";

import { useMemo } from "react";

import { useDMConversations } from "@/hooks/use-dm-conversations";

/**
 * Arkadaş kimliği → son mesajlaşma anı (ms) — SPEC §4'ün `Son etkileşim`
 * sıralaması.
 *
 * Veri arkadaş listesinde **yok**: sohbet listesinden türüyor. Ayrı bir uç
 * açmak, aynı bilgiyi ikinci kez göndermek olurdu — sohbet listesi zaten
 * `lastMessageAt` taşıyor ve zaten önbellekte.
 *
 * Yalnız **1:1** sohbetler sayılıyor. Bir grup sohbetindeki mesaj "bu kişiyle
 * konuştum" demek değil; grubu sayan bir sıralama, hiç özel mesaj atmadığın
 * birini listenin başına taşırdı.
 */
export function useFriendLastInteraction(currentUserId: string): ReadonlyMap<string, number> {
  const { conversations } = useDMConversations(currentUserId);

  return useMemo(() => {
    const byFriendId = new Map<string, number>();

    for (const conversation of conversations) {
      if (conversation.type !== "DM") {
        continue;
      }

      const counterpart = conversation.participants.find(
        (participant) => participant.userId !== currentUserId,
      );

      if (!counterpart) {
        continue;
      }

      const at = Date.parse(conversation.lastMessageAt);

      if (!Number.isFinite(at)) {
        continue;
      }

      // Aynı kişiyle birden çok konuşma satırı olamaz, ama önbellek bir yenileme
      // sırasında geçici olarak iki kopya tutabilir; en yenisi kazanır.
      byFriendId.set(counterpart.userId, Math.max(byFriendId.get(counterpart.userId) ?? 0, at));
    }

    return byFriendId;
  }, [conversations, currentUserId]);
}
