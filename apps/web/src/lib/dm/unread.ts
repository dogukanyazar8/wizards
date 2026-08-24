import type { DMConversationDTO } from "@wizards/types";

/**
 * DM okunmamış toplamı — `03-faz2-kabuk-nav-paneli.md` §4.
 *
 * Sayaç konuşmanın kendisinde değil, **izleyicinin katılımcı satırında** durur: aynı konuşmanın
 * karşı tarafının okunmamışı bu toplama girmez. Kabuk (ray/panel rozeti) ve DM listesi başlığı
 * bu tek fonksiyonu çağırır; iki ayrı hesap yoktur.
 */
export function sumDMUnreadCount(
  conversations: readonly DMConversationDTO[],
  viewerId: string,
): number {
  return conversations.reduce((total, conversation) => {
    const viewerParticipant = conversation.participants.find(
      (participant) => participant.userId === viewerId,
    );

    return total + (viewerParticipant?.unreadCount ?? 0);
  }, 0);
}
