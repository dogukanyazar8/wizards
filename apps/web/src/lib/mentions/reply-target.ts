import type { Mention } from "@wizards/types";

/**
 * Yanıtın **nereye** gideceği — karar K10.
 *
 * Kural üç satır ama üç ayrı yerde tekrar edilirse biri bir gün diğerinden ayrılır: yanıt
 * kutusunun meta satırı hedefi yazıyor, yer tutucu metni hedefe göre değişiyor ve gönderim
 * hedefe göre farklı bir socket olayı sürüyor. Üçü de buradan okur.
 *
 * K10: thread kartında yanıt **thread'e** gider, diğer türlerde kanala ya da DM'e. Thread
 * yanıtını kanala göndermek onu bağlamından koparır — kullanıcı yanıtını okuyanların thread'i
 * açtığını varsayar.
 */

export type MentionReplyTarget =
  | { readonly channelId: string; readonly replyToId: string; readonly type: "channel" }
  | { readonly channelId: string; readonly parentMessageId: string; readonly type: "thread" }
  | { readonly conversationId: string; readonly replyToId: string; readonly type: "dm" };

/** Bahsetmenin gerçek mesaj kimliği; navigasyon adresi gönderim sözleşmesi değildir. */
export function readMentionMessageId(mention: Mention): string {
  return mention.messageId;
}

export function resolveReplyTarget(mention: Mention): MentionReplyTarget {
  const messageId = readMentionMessageId(mention);

  if (mention.source.type === "dm") {
    return { conversationId: mention.source.conversationId, replyToId: messageId, type: "dm" };
  }

  if (mention.kind === "thread") {
    return {
      channelId: mention.source.channelId,
      // Thread'in anahtarı üst mesajdır. `thread` bloğu yoksa bahsetmenin kendisi üst mesaj
      // sayılır — yanıt yine aynı thread'e düşer, yeni bir thread açmaz.
      parentMessageId: mention.thread?.id ?? messageId,
      type: "thread",
    };
  }

  return { channelId: mention.source.channelId, replyToId: messageId, type: "channel" };
}

/** Yer tutucu ve meta satırı anahtarları — hedefi tek yerde metne çeviren eşleme. */
export const MENTION_REPLY_COPY_KEY = {
  channel: { meta: "mentions.reply.meta", placeholder: "mentions.reply.placeholder" },
  dm: { meta: "mentions.reply.meta", placeholder: "mentions.reply.placeholderDm" },
  thread: { meta: "mentions.reply.metaThread", placeholder: "mentions.reply.placeholderThread" },
} as const satisfies Record<
  MentionReplyTarget["type"],
  { readonly meta: string; readonly placeholder: string }
>;
