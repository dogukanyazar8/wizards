/**
 * Bahsedilmeler akışının klavye sözleşmesi — SPEC §9, PROMPT §5.
 *
 * `J/K/↑/↓/R/E/Esc` tek harfli kısayollar. Tek harfli kısayolun tek gerçek riski kullanıcının
 * bir metin alanına yazarken onları tetiklemesidir: satır içi yanıt kutusunda `J` yazan biri
 * kartın değişmesini değil, harfin görünmesini bekler. O yüzden bu modül iki soruyu ayrı ayrı
 * cevaplar — "hangi kısayol" ve "burada kısayol çalışır mı".
 *
 * Saf tutulmasının sebebi: gerçek bir `KeyboardEvent` olmadan koşulabilsin. Testte tuş
 * kombinasyonu bir nesnedir, bir tarayıcı değil.
 */

import {
  isAppShortcutTypingTarget,
  resolveAppShortcut,
  type AppShortcutId,
} from "@/lib/shortcuts/catalog";

export type MentionShortcut = "next" | "previous" | "reply" | "toggleRead" | "close";

const MENTION_SHORTCUT_IDS = [
  "mentions.next",
  "mentions.previous",
  "mentions.reply",
  "mentions.toggleRead",
  "mentions.close",
] as const satisfies readonly AppShortcutId[];

const MENTION_SHORTCUT_BY_ID: Readonly<
  Record<(typeof MENTION_SHORTCUT_IDS)[number], MentionShortcut>
> = {
  "mentions.close": "close",
  "mentions.next": "next",
  "mentions.previous": "previous",
  "mentions.reply": "reply",
  "mentions.toggleRead": "toggleRead",
};

/** `KeyboardEvent`in bu modülün ihtiyacı olan yüzeyi. */
export type MentionKeyInput = {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

/**
 * `Shift` **kabul edilir**: büyük `J` zaten Shift ile gelir ve onu elemek tuşun yarısını
 * kaybettirirdi. `Ctrl`/`Meta`/`Alt` elenir — `Ctrl+R` sayfayı yeniler, `Cmd+E` tarayıcının
 * kendi kısayoludur; onları çalmak ekranın dışındaki bir sözleşmeyi bozar.
 */
export function resolveMentionShortcut(input: MentionKeyInput): MentionShortcut | null {
  const id = resolveAppShortcut(MENTION_SHORTCUT_IDS, input);
  return id ? MENTION_SHORTCUT_BY_ID[id] : null;
}

/** `EventTarget`in bu modülün ihtiyacı olan yüzeyi. */
export type MentionKeyTarget = {
  readonly isContentEditable?: boolean;
  readonly tagName?: string;
} | null;

/**
 * Odak bir metin yüzeyindeyse akış kısayolları susar (PROMPT §5). Ayrım eleman türünden
 * yapılır, bileşen adından değil: yanıt kutusunu Ş7 yazıyor ve akış onun iç yapısını bilmez.
 */
export function isTypingTarget(target: MentionKeyTarget): boolean {
  return isAppShortcutTypingTarget(target);
}

/**
 * İmleci bir kart ileri ya da geri taşır.
 *
 * **Başa sarmaz.** Kırkıncı karttayken tek tuşla listenin başına fırlamak, kullanıcının
 * bulduğu yeri kaybetmesi demek; uçta durmak hiçbir şey kaybettirmez.
 *
 * Listede olmayan bir imleç (kartı `Listeden kaldır` ile düşmüş olabilir) ilk karta toparlanır.
 */
export function moveMentionCursor(
  ids: readonly string[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  if (ids.length === 0) {
    return null;
  }

  const index = current === null ? -1 : ids.indexOf(current);

  if (index < 0) {
    return direction === 1 ? (ids[0] ?? null) : (ids.at(-1) ?? null);
  }

  const next = Math.min(Math.max(index + direction, 0), ids.length - 1);
  return ids[next] ?? null;
}
