/**
 * SPEC-SUNUCU §2.4: bir kategori **daraltıldığında** listede yalnız üç kanal kalır —
 * aktif olan, okunmamışı olan, içinde konuşan olan.
 *
 * Kural saf bir fonksiyon olarak yaşıyor çünkü iki yerden okunacak: kenar çubuğunun kendisi
 * (Ş4) ve `⌘K` arama popover'ının "daraltılmış kategorideki kanalı da bul" davranışı. İki
 * kopya, iki farklı "görünür" tanımı demek olurdu.
 */

export type CollapsedChannelInput = {
  id: string;
  /** Metin kanalı için okunmamış mesaj sayısı; ses kanalında 0'dır. */
  unreadCount?: number;
};

export type CollapsedCategoryContext = {
  /** Şu an açık kanal; `null` ise hiçbiri aktif değildir. */
  activeChannelId: string | null;
  /**
   * Ses durumları: kanal kimliğinden o kanaldaki katılımcı sayısına. `useVoiceStates`'in
   * verdiği harita doğrudan geçirilebilir.
   */
  voiceStates?: ReadonlyMap<string, number>;
};

export function shouldShowInCollapsedCategory(
  channel: CollapsedChannelInput,
  context: CollapsedCategoryContext,
): boolean {
  if (channel.id === context.activeChannelId) {
    return true;
  }

  if ((channel.unreadCount ?? 0) > 0) {
    return true;
  }

  return (context.voiceStates?.get(channel.id) ?? 0) > 0;
}

/**
 * Daraltılmış kategoride gizlenen kanal sayısı — başlıktaki `2 gizli` çipi buradan gelir.
 * Kategori açıkken çip çizilmez, bu yüzden fonksiyon yalnız daraltılmış hâl için çağrılır.
 */
export function countHiddenInCollapsedCategory(
  channels: readonly CollapsedChannelInput[],
  context: CollapsedCategoryContext,
): number {
  return channels.filter((channel) => !shouldShowInCollapsedCategory(channel, context)).length;
}

/** Daraltılmış kategoride çizilecek kanallar, giriş sırası korunarak. */
export function filterCollapsedCategoryChannels<TChannel extends CollapsedChannelInput>(
  channels: readonly TChannel[],
  context: CollapsedCategoryContext,
): TChannel[] {
  return channels.filter((channel) => shouldShowInCollapsedCategory(channel, context));
}
