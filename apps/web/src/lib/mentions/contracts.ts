import type { ReactNode } from "react";

import type { Mention, MentionCounts, MentionKind } from "@wizards/types";

/**
 * Dalga 2 şeritleri arasındaki **prop sözleşmesi**.
 *
 * Ş5 akışı, Ş6 kartı, Ş7 yanıt kutusu ile bağlam panelini ayrı ayrı yazıyor. Üçü aynı anda
 * ilerleyebilsin diye temas noktaları Dalga 0'da donuyor: bir şerit karşı tarafı beklemek
 * yerine bu tipe göre yazar ve testini sahte veriyle koşar.
 *
 * `MentionCard` bilerek **saf bir sunum bileşenidir**: hiçbir mutasyonu kendi çağırmaz, hiçbir
 * sorgu okumaz. Kart akışta yüzlerce kez render edilir; içine bir `useMutation` koymak, bir
 * ekran dolusu bağımsız mutasyon örneği demektir ve hangisinin hangi kartı yazdığı test
 * edilemez hâle gelir.
 */

/** SPEC §5.1 — `⋯` menüsünün dört satırı. */
export type MentionMenuAction = "copy-link" | "read-later" | "mute-source" | "dismiss";

/**
 * Menü yönü karttan değil **akıştan** gelir: kart kendi indeksini bilmez, akış bilir.
 * İlk iki kart aşağı, sonrakiler yukarı açar (SPEC §5.1) ki menü akış dışına taşmasın.
 */
export type MentionMenuDirection = "down" | "up";

export type MentionCardProps = {
  readonly mention: Mention;
  /** Klavye imleci (`J`/`K`) bu karttaysa `true`. Okunmamışlıktan ayrı bir bilgi. */
  readonly active: boolean;
  readonly menuOpen: boolean;
  readonly replyOpen: boolean;
  readonly contextOpen: boolean;
  readonly menuDirection: MentionMenuDirection;
  /** Ş7'nin yanıt kutusu; kart yalnız yerini ayırır. */
  readonly replySlot?: ReactNode;
  /** Kart gövdesine tıklama — bahsetmeyi kanalda/DM'de açar ve okundu işaretler. */
  readonly onOpen: () => void;
  readonly onReply: () => void;
  readonly onContext: () => void;
  readonly onToggleRead: () => void;
  readonly onMenuToggle: () => void;
  readonly onMenuAction: (action: MentionMenuAction) => void;
};

/** SPEC §5 tür pilinin token adı. `everyone` `--warning`, `role` `--info` kullanır. */
export const MENTION_KIND_TONE: Readonly<Record<MentionKind, string>> = {
  me: "--primary",
  role: "--info",
  everyone: "--warning",
  thread: "--success",
};

/** SPEC §3 tür satırlarının glifleri. */
export const MENTION_KIND_GLYPH: Readonly<Record<MentionKind | "unread", string>> = {
  me: "@",
  role: "R",
  thread: "T",
  everyone: "@",
  unread: "!",
};

/**
 * Ray tür satırlarının sırası ve hangi filtreyi sürdükleri (SPEC §3 tablosu). Sıra tasarımdan
 * gelir; alfabetik ya da sayıya göre sıralanmaz.
 */
export const MENTION_SIDEBAR_KIND_ROWS = [
  { id: "me", filter: "me" },
  { id: "role", filter: "role" },
  { id: "thread", filter: "thread" },
  { id: "unread", filter: "unread" },
] as const satisfies ReadonlyArray<{ readonly id: string; readonly filter: string }>;

export type MentionSidebarKindRowId = (typeof MENTION_SIDEBAR_KIND_ROWS)[number]["id"];

/**
 * `Rol bahsetmeleri` satırı `@herkes`i de sayar — tasarımın örnek verisinde 2 rol + 1 kitlesel
 * çağrı `3` yazıyor ve aynı sayı `Rol · @herkes` sekmesinde de duruyor. İki yüzey aynı sayıyı
 * göstermek zorunda olduğu için okuma tek yerde.
 */
export function readMentionKindRowCount(
  counts: MentionCounts,
  row: MentionSidebarKindRowId,
): number {
  switch (row) {
    case "me":
      return counts.me;
    case "role":
      return counts.role + counts.everyone;
    case "thread":
      return counts.thread;
    case "unread":
      return counts.unread;
  }
}

/**
 * SPEC §4 sekmeleri. Sıra tasarımdan.
 *
 * `role` sekmesi (`Rol · @herkes`) **iki** türü birden sayar ve `dm` sekmesi sayısını
 * `bySource` haritasından alır; bu yüzden sayı düz bir alan adı değil, bir okuyucudur.
 */
export const MENTION_TABS = [
  { id: "all", filter: "all" },
  { id: "unread", filter: "unread" },
  { id: "role", filter: "role" },
  { id: "dm", filter: "dm" },
] as const satisfies ReadonlyArray<{ readonly id: string; readonly filter: string }>;

export type MentionTabId = (typeof MENTION_TABS)[number]["id"];

export function readMentionTabCount(counts: MentionCounts, tab: MentionTabId): number {
  switch (tab) {
    case "all":
      return counts.all;
    case "unread":
      return counts.unread;
    case "role":
      return counts.role + counts.everyone;
    case "dm":
      return counts.bySource.dm ?? 0;
  }
}
