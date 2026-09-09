/**
 * Kanal ve kategori sıralamasının saf çekirdeği — SPEC-SUNUCU §8.4.
 *
 * Ayarların Kanallar bölümünde sıra **iki** yoldan değişiyor: sürükleme (dnd-kit) ve
 * yukarı/aşağı düğmeleri. İkisi de aynı uçlara yazıyor (`channels/reorder`,
 * `categories/reorder`) ve aynı yükü üretmek zorunda — klavyeyle taşınan bir kanalın
 * fareyle taşınandan farklı bir `position` alması, listeyi iki istemcide iki farklı sırada
 * gösterirdi.
 *
 * Bu yüzden hesap bileşenin içinde değil burada. A11y §12 klavye alternatifini **zorunlu**
 * tutuyor; zorunlu bir yolun testi de zorunludur ve saf bir modül olmadan bu test
 * kurulamıyordu.
 *
 * `position` her zaman **0'dan başlayan yoğun bir dizin**tir: uç kısmi yük kabul ettiği için
 * yalnız değişen kategoriler gönderilir, ama gönderilen kategori bütün kanallarıyla gider.
 */

export type ChannelOrderItem = {
  categoryId: string | null;
  id: string;
  position: number;
};

export type CategoryOrderItem = {
  id: string;
  position: number;
};

export type OrderDirection = "up" | "down";

type Identified = { id: string };

function swapAt<T>(items: readonly T[], index: number, direction: OrderDirection): T[] | null {
  const target = direction === "up" ? index - 1 : index + 1;

  if (index < 0 || target < 0 || target >= items.length) {
    return null;
  }

  const next = [...items];
  const moved = next[index] as T;
  next[index] = next[target] as T;
  next[target] = moved;

  return next;
}

/** Kategori listesini yoğun `position` yüküne çevirir. */
export function buildCategoryPositions(categories: readonly Identified[]): CategoryOrderItem[] {
  return categories.map((category, index) => ({ id: category.id, position: index }));
}

/** Tek kategorinin kanallarını yoğun `position` yüküne çevirir. */
export function buildChannelPositions(
  categoryId: string | null,
  channels: readonly Identified[],
): ChannelOrderItem[] {
  return channels.map((channel, index) => ({ categoryId, id: channel.id, position: index }));
}

/**
 * `Yukarı taşı` / `Aşağı taşı` — kategori. Listenin ucundaysa `null` döner ve tüketici
 * düğmeyi `disabled` çizer; boşa giden bir istek göndermez.
 */
export function moveCategory(
  categories: readonly Identified[],
  categoryId: string,
  direction: OrderDirection,
): CategoryOrderItem[] | null {
  const index = categories.findIndex((category) => category.id === categoryId);
  const next = swapAt(categories, index, direction);

  return next === null ? null : buildCategoryPositions(next);
}

/** `Yukarı taşı` / `Aşağı taşı` — kanal; yalnız kendi kategorisi içinde. */
export function moveChannel(
  categoryId: string | null,
  channels: readonly Identified[],
  channelId: string,
  direction: OrderDirection,
): ChannelOrderItem[] | null {
  const index = channels.findIndex((channel) => channel.id === channelId);
  const next = swapAt(channels, index, direction);

  return next === null ? null : buildChannelPositions(categoryId, next);
}

/**
 * Sürükleme sonucu. Kaynak ve hedef aynı kategoriyse tek kategori yeniden numaralanır;
 * farklıysa **iki** kategori birden gönderilir — kaynaktaki boşluk kapanmazsa `position`
 * dizini seyrekleşir ve bir sonraki taşımada iki kanal aynı sayıyı alır.
 *
 * `targetIndex` `null` ise kanal hedef kategorinin **sonuna** eklenir (kategori başlığına
 * bırakma).
 */
export function moveChannelBetweenCategories(args: {
  channelId: string;
  sourceCategoryId: string | null;
  sourceChannels: readonly Identified[];
  targetCategoryId: string | null;
  targetChannels: readonly Identified[];
  targetIndex: number | null;
}): ChannelOrderItem[] | null {
  const { channelId, sourceCategoryId, sourceChannels, targetCategoryId, targetChannels } = args;
  const sourceIndex = sourceChannels.findIndex((channel) => channel.id === channelId);

  if (sourceIndex < 0) {
    return null;
  }

  if (sourceCategoryId === targetCategoryId) {
    const targetIndex = args.targetIndex ?? sourceChannels.length - 1;

    if (targetIndex < 0 || targetIndex >= sourceChannels.length || targetIndex === sourceIndex) {
      return null;
    }

    const next = [...sourceChannels];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved as Identified);

    return buildChannelPositions(sourceCategoryId, next);
  }

  const moved = sourceChannels[sourceIndex] as Identified;
  const nextSource = sourceChannels.filter((channel) => channel.id !== channelId);
  const nextTarget = [...targetChannels];
  const insertAt = Math.min(Math.max(args.targetIndex ?? nextTarget.length, 0), nextTarget.length);
  nextTarget.splice(insertAt, 0, moved);

  return [
    ...buildChannelPositions(sourceCategoryId, nextSource),
    ...buildChannelPositions(targetCategoryId, nextTarget),
  ];
}
