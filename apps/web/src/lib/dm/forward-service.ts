import { prisma } from "@wizards/db";
import type { Server } from "socket.io";

import { ApiError } from "@/lib/api";
import { requireDMParticipant, toHistoryWindowFilter, toUnexpiredFilter } from "@/lib/dm/service";
import { sendDirectMessage } from "@/lib/dm/message-send-service";

/**
 * Mesaj iletme — SPEC-MESAJLAR §5.3'ün `Mesajı ilet` satırı.
 *
 * İki ayrı yetki kontrolü var ve ikisi de şart:
 *
 * 1. **Kaynak**: görüntüleyen o konuşmanın katılımcısı olmalı ve mesaj onun
 *    geçmiş penceresinin içinde kalmalı. Olmasaydı, bir kimliği bilen herkes
 *    üyesi olmadığı bir sohbetin içeriğini kendine iletebilirdi.
 * 2. **Hedef**: `sendDirectMessage` zaten katılımcılığı, engelleri ve kaybolan
 *    mesaj penceresini kontrol ediyor; ikinci bir kapı yazmıyoruz.
 *
 * **Ekler taşınmıyor.** Bir eki ikinci bir mesaja bağlamak depolama sahipliğini
 * çoğaltmak demek (aynı blob iki mesaja ait olur ve biri silinince diğeri kırık
 * kalır); doğru çözüm sayaçlı bir depolama katmanı ve bu iletme akışının işi
 * değil. Metni olmayan bir mesaj bu yüzden **iletilemez** ve neden söylenir.
 */

export type ForwardDirectMessageInput = {
  io: Server | null;
  messageId: string;
  targetConversationId: string;
  userId: string;
};

export type ForwardDirectMessageDeps = {
  findMessage: typeof prisma.dMMessage.findFirst;
  now: () => Date;
};

const defaultDeps: ForwardDirectMessageDeps = {
  findMessage: (args) => prisma.dMMessage.findFirst(args),
  now: () => new Date(),
};

export async function forwardDirectMessage(
  input: ForwardDirectMessageInput,
  deps: ForwardDirectMessageDeps = defaultDeps,
) {
  const source = await deps.findMessage({
    where: { id: input.messageId },
    select: { conversationId: true, content: true, createdAt: true, deletedAt: true },
  });

  if (!source || source.deletedAt) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  // Kaynak konuşmanın üyeliği: **404**, 403 değil. 403 "var ama senin değil"
  // demek olurdu ve bir kimliğin gerçek olduğunu doğrulardı.
  const membership = await requireDMParticipant(input.userId, source.conversationId).catch(() => {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  });

  // Geçmiş penceresi ve kaybolan mesaj süresi kaynağa da uygulanır: pencerenin
  // dışındaki bir mesajı iletmek, 2c §7'nin etrafından dolaşmak olurdu.
  const visible = await deps.findMessage({
    where: {
      id: input.messageId,
      conversationId: source.conversationId,
      ...toHistoryWindowFilter(membership.historyFromAt, null),
      ...toUnexpiredFilter(deps.now()),
    },
    select: { id: true },
  });

  if (!visible) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  const content = source.content.trim();

  if (content.length === 0) {
    throw new ApiError("Only messages with text can be forwarded", 400, "FORWARD_REQUIRES_TEXT");
  }

  return sendDirectMessage({
    attachments: [],
    content,
    conversationId: input.targetConversationId,
    forwardOfMessageId: input.messageId,
    io: input.io,
    userId: input.userId,
  });
}
