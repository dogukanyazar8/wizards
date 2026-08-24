import type { Mention, MentionCounts } from "@wizards/types";

import { getSocketServer, type AppSocketServer } from "@/lib/socket/runtime";

/**
 * Bahsedilmeler — Dalga 1 / Ş3. Ekranın canlı ucu.
 *
 * Üç olay, hepsi `user:<id>` odasına. Oda seçimi kasıtlı: bir bahsetme kartı yalnız
 * bahsedilenin ekranında var, kanalın diğer üyelerinde yok — kanal odasına yayılan bir olay
 * herkese başkasının sayacını taşırdı.
 *
 * Mevcut `notification:new` **kaldırılmaz**. Zil menüsü ile bahsetme ekranı iki ayrı yüzey;
 * bahsetme bildirimleri her iki olayı da taşır ve zil menüsünü bahsetme ekranına bağlamak,
 * arkadaşlık isteğini de bahsetme sayacına sokmak demekti.
 *
 * Her yayın **sayaçları da** taşır: istemcinin sayaçları ayrıca sorgulaması, olayla sorgu
 * arasındaki pencerede yanlış sayı göstermek demek. Sayı olayın kendisiyle gelir.
 */

export type MentionRealtimePublisher = {
  publishMentionCreated: (userId: string, mention: Mention, counts: MentionCounts) => void;
  publishMentionReadAll: (userId: string, counts: MentionCounts) => void;
  publishMentionState: (
    userId: string,
    state: {
      readonly dismissed: boolean;
      readonly mentionId: string;
      readonly readLater: boolean;
      readonly unread: boolean;
    },
    counts: MentionCounts,
  ) => void;
};

function room(userId: string): string {
  return `user:${userId}`;
}

export function publishMentionCreated(
  userId: string,
  mention: Mention,
  counts: MentionCounts,
  server: AppSocketServer | null = getSocketServer(),
): void {
  server?.to(room(userId)).emit("mention:new", { counts, mention });
}

export function publishMentionState(
  userId: string,
  state: {
    readonly dismissed: boolean;
    readonly mentionId: string;
    readonly readLater: boolean;
    readonly unread: boolean;
  },
  counts: MentionCounts,
  server: AppSocketServer | null = getSocketServer(),
): void {
  server?.to(room(userId)).emit("mention:state", {
    counts,
    dismissed: state.dismissed,
    mentionId: state.mentionId,
    readLater: state.readLater,
    unread: state.unread,
  });
}

export function publishMentionReadAll(
  userId: string,
  counts: MentionCounts,
  server: AppSocketServer | null = getSocketServer(),
): void {
  server?.to(room(userId)).emit("mention:read-all", { counts });
}

/** Rota katmanının varsayılanı; testte tek nesne değiştirilir, üç ayrı sahte yazılmaz. */
export const defaultMentionRealtimePublisher: MentionRealtimePublisher = {
  publishMentionCreated: (userId, mention, counts) =>
    publishMentionCreated(userId, mention, counts),
  publishMentionReadAll: (userId, counts) => publishMentionReadAll(userId, counts),
  publishMentionState: (userId, state, counts) => publishMentionState(userId, state, counts),
};
