import type { ConversationRowDTO, MessagesPresence } from "@wizards/types";
import type { DMConversationDTO, DMPresenceStatus } from "@wizards/types";

/**
 * Sohbet rayı satırının sunum katmanı — SPEC §3.
 *
 * Saf: React yok, `t()` yok, `Date.now()` yok. Metin ve şimdiki zaman **girdi**
 * olarak gelir, çünkü ikisi de görüntüleyene bağlıdır (dil ve saat dilimi) ve
 * bir bileşenin içinde hesaplanan zaman testte dondurulamaz.
 */

const PRESENCE_BY_STATUS: Readonly<Record<DMPresenceStatus, MessagesPresence>> = Object.freeze({
  DND: "dnd",
  IDLE: "idle",
  OFFLINE: "offline",
  ONLINE: "online",
});

export function toMessagesPresence(status: DMPresenceStatus | null | undefined): MessagesPresence {
  return status ? (PRESENCE_BY_STATUS[status] ?? "offline") : "offline";
}

/**
 * İki harf: iki kelimeden birer harf, tek kelimede tek harf.
 *
 * Büyütme `tr` kuralıyla — `irem` İngilizce kuralla `IREM` olurdu, Türkçede
 * `İREM`. Ray tile'ı bu iki harfi çiziyor ve yanlış harf ilk bakışta yanlış kişi
 * demek.
 */
export function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return (
    parts
      .slice(0, 2)
      .map((part) => Array.from(part)[0] ?? "")
      .join("")
      .toLocaleUpperCase("tr") || "?"
  );
}

export type RailTimeLabels = {
  /** "Dün" — dünkü bir mesaj. */
  yesterday: string;
  /** Haftanın günleri, pazardan başlayarak: ["Paz", "Pzt", …]. */
  weekdays: readonly string[];
};

/**
 * SPEC §3'ün saat sütunu: bugünse `09:26`, dünse `Dün`, bu haftaysa `Pzt`,
 * daha eskiyse `12 Ağu`.
 *
 * `now` parametre: bir bileşenin içinde okunan saat testte dondurulamaz ve
 * gece yarısını geçen bir oturumda satır kendi kendine "Dün" olmaz.
 */
export function formatRailTime(
  sentAt: Date,
  now: Date,
  labels: RailTimeLabels,
  locale: string,
): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfSent = new Date(sentAt.getFullYear(), sentAt.getMonth(), sentAt.getDate());
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfSent.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (dayDifference <= 0) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
    }).format(sentAt);
  }

  if (dayDifference === 1) {
    return labels.yesterday;
  }

  if (dayDifference < 7) {
    return labels.weekdays[sentAt.getDay()] ?? "";
  }

  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(sentAt);
}

export type RailRowInput = {
  /** `Sen: ` gibi ön ek; kendi mesajı değilse null. */
  authorPrefix: string | null;
  conversation: DMConversationDTO;
  currentUserId: string;
  /** Konuşma adı; grup başlığı ya da karşı tarafın adı. */
  name: string;
  now: Date;
  locale: string;
  /** Son mesajın tek satırlık özeti. */
  preview: string;
  timeLabels: RailTimeLabels;
};

/**
 * Ray satırı. `pinned` **görüntüleyenin kendi** sabitlemesidir (`DMParticipant.
 * pinnedAt`), konuşmanın sabitlenen mesajı değil — SPEC §3 "Sabitlenenler"
 * bölümü bu ayrımı taşır.
 */
export function toConversationRow(input: RailRowInput): ConversationRowDTO {
  const { conversation, currentUserId } = input;
  const isGroup = conversation.type === "GROUP_DM";
  const counterpart = conversation.participants.find(
    (participant) => participant.userId !== currentUserId,
  );
  const viewer = conversation.participants.find(
    (participant) => participant.userId === currentUserId,
  );

  return {
    id: conversation.id,
    initials: toInitials(input.name),
    kind: isGroup ? "group" : "dm",
    name: input.name,
    pinned: Boolean(conversation.pinnedAt),
    // Grupta presence noktası yok: rozet bir kişinin durumudur, bir odanınki değil.
    presence: isGroup ? null : toMessagesPresence(counterpart?.status),
    preview: { authorPrefix: input.authorPrefix, text: input.preview },
    tileColor: isGroup ? (conversation.avatarColor ?? null) : null,
    timeLabel: formatRailTime(
      new Date(conversation.lastMessageAt),
      input.now,
      input.timeLabels,
      input.locale,
    ),
    unreadCount: viewer?.unreadCount ?? 0,
  };
}

/**
 * SPEC §3'ün iki bölümü. Sabitlenenler aynı sıralamanın bir dilimidir, ikinci
 * bir sorgu değil: sıra `lastMessageAt`'tir ve sabitleme onu değiştirmez, yalnız
 * satırı yukarı taşır.
 */
export function splitRailSections<T extends { pinned: boolean }>(
  rows: readonly T[],
): { pinned: T[]; rest: T[] } {
  return {
    pinned: rows.filter((row) => row.pinned),
    rest: rows.filter((row) => !row.pinned),
  };
}

/**
 * İstemci tarafı süzme: ad ve önizleme.
 *
 * `toLocaleLowerCase("tr")` şart — `I` harfini İngilizce kuralla küçültmek
 * `İstanbul` yazan birinin `istanbul` aramasında sonuç bulamaması demek.
 */
export function filterRailRows<T extends ConversationRowDTO>(
  rows: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase("tr");

  if (needle.length === 0) {
    return [...rows];
  }

  return rows.filter((row) =>
    `${row.name} ${row.preview.text}`.toLocaleLowerCase("tr").includes(needle),
  );
}
