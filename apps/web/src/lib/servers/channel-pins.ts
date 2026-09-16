import type { ChatMessage, PinnedMessageDTO } from "@wizards/types";
import { z } from "zod";

export const ChannelPinCursorSchema = z.object({
  pinnedAt: z.iso.datetime(),
  messageId: z.string().min(1).max(128),
});
export type ChannelPinCursor = z.infer<typeof ChannelPinCursorSchema>;

export function selectChannelPinPage<T extends { pinnedAt: Date; messageId: string }>(
  rows: readonly T[],
  pageSize: number,
) {
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  return {
    page,
    nextCursor:
      rows.length > pageSize && last
        ? { pinnedAt: last.pinnedAt.toISOString(), messageId: last.messageId }
        : null,
  };
}

export function channelPinPageWhere(cursor?: ChannelPinCursor) {
  if (!cursor) return {};
  return {
    OR: [
      { pinnedAt: { lt: new Date(cursor.pinnedAt) } },
      { pinnedAt: new Date(cursor.pinnedAt), messageId: { lt: cursor.messageId } },
    ],
  };
}

/**
 * SPEC-SUNUCU §3.2 — sabitlenen mesaj çubuğunun beslemesi.
 *
 * Kanal sabitleri `ChatMessage` olarak geliyor (`GET /channels/[id]/pins`), DM sabitleri ise
 * `PinnedMessageDTO` olarak. Çubuk **tek** bileşen (Ş6 şerit dosyası §2) ve tek bir şekli
 * okumak zorunda; bu modül kanal tarafını o şekle çeviriyor.
 *
 * Uç tarafında bir değişiklik **yok**: iki yüzeyin iki ayrı yetki modeli var (Mesajlar karar #7)
 * ve tek sorguya sıkıştırmak onları bir yanıtın içinde karıştırırdı.
 */

/** Şerit `pins[0]`ı "en yeni" sayar; sıralama bu yüzden burada yapılır. */
function pinnedAtMs(message: ChatMessage): number {
  const stamp = message.pinnedAt ?? message.createdAt;
  const parsed = Date.parse(stamp);

  return Number.isNaN(parsed) ? 0 : parsed;
}

export function toChannelPinnedMessages(
  messages: readonly ChatMessage[],
  options: { readonly attachmentOnlyLabel: string; readonly canModerate: boolean },
): PinnedMessageDTO[] {
  return [...messages]
    .filter((message) => !message.deletedAt)
    .sort((left, right) => pinnedAtMs(right) - pinnedAtMs(left))
    .map((message) => ({
      authorName: message.author.displayName,
      // Ek-only sabitte gövde boştur; çubuk boş bir satır çizmek yerine etiketi yazar.
      excerpt: message.content.trim() || options.attachmentOnlyLabel,
      messageId: message.id,
      pinnedAt: message.pinnedAt ?? message.createdAt,
      removable: options.canModerate,
    }));
}
