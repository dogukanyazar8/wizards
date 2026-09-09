/**
 * Ayarlar aramasının eşleme ve sıralama katmanı (§5).
 *
 * İndeks üretimi `search-index.ts`'te, eşleme burada: indeks bir kez kurulur ve her tuş
 * vuruşunda yalnız bu dosya koşar. Skor **kademedir**, ağırlıklı bir toplam değil — "başlıkta
 * kelime başı" ile "seçenek etiketinde geçiyor" arasındaki fark bir katsayıyla ifade edilirse
 * uzun bir açıklama, aranan başlığı sonuçların altına iter.
 */

import {
  normalizeSettingsSearchText,
  type SettingsSearchEntry,
  type SettingsTranslator,
} from "@/lib/settings/search-index";

/** İki karakterden kısa sorgu 169 satırın yarısını döndürürdü; arama o uzunlukta başlar. */
export const SETTINGS_SEARCH_MIN_QUERY_LENGTH = 2;

export const SETTINGS_SEARCH_DEFAULT_LIMIT = 20;

/** SPEC §4.6 — `Bölüm › Grup`. Ayraç noktalama, çeviri değil. */
export const SETTINGS_SEARCH_PATH_SEPARATOR = " › ";

/**
 * Kademeler. `0` en güçlü delil.
 *
 * `4` spec'in saydığı dört kademenin dışındadır: yalnız grup başlığı eşleşen satır sonucun
 * içinde kalır (kullanıcı `sessiz saatler` yazınca o grubun satırlarını görmek ister) ama
 * kendi başlığı eşleşen hiçbir satırın önüne geçmez.
 */
const RANK_TITLE_WORD_START = 0;
const RANK_TITLE_CONTAINS = 1;
const RANK_DESCRIPTION_CONTAINS = 2;
const RANK_OPTION_CONTAINS = 3;
const RANK_GROUP_CONTAINS = 4;
const RANK_NONE = 5;

const WORD_BOUNDARY = /[^\p{L}\p{N}]/u;

/** `haystack` içinde `needle` bir kelimenin başında mı geçiyor. */
function hasWordStartMatch(haystack: string, needle: string): boolean {
  let index = haystack.indexOf(needle);

  while (index !== -1) {
    if (index === 0 || WORD_BOUNDARY.test(haystack.charAt(index - 1))) {
      return true;
    }

    index = haystack.indexOf(needle, index + 1);
  }

  return false;
}

function rankEntry(entry: SettingsSearchEntry, needle: string): number {
  if (entry.title.includes(needle)) {
    return hasWordStartMatch(entry.title, needle) ? RANK_TITLE_WORD_START : RANK_TITLE_CONTAINS;
  }

  if (entry.description.includes(needle)) return RANK_DESCRIPTION_CONTAINS;
  if (entry.options.includes(needle)) return RANK_OPTION_CONTAINS;
  if (entry.group.includes(needle)) return RANK_GROUP_CONTAINS;

  return RANK_NONE;
}

/**
 * Eşleşen kayıtları kademe, sonra ağaç sırasıyla döndürür.
 *
 * Sorgu da indeks de aynı normalizasyondan geçer (`search-index.ts` §6): `Bİldİrİm`,
 * `BILDIRIM` ve `bildirim` bu yüzden tek bir dizeye iner ve aynı kümeyi bulur.
 */
export function searchSettings(
  index: readonly SettingsSearchEntry[],
  query: string,
  limit: number = SETTINGS_SEARCH_DEFAULT_LIMIT,
): SettingsSearchEntry[] {
  const needle = normalizeSettingsSearchText(query);

  if (needle.length < SETTINGS_SEARCH_MIN_QUERY_LENGTH || limit <= 0) {
    return [];
  }

  const scored: Array<{ entry: SettingsSearchEntry; rank: number }> = [];

  for (const entry of index) {
    const rank = rankEntry(entry, needle);

    if (rank !== RANK_NONE) {
      scored.push({ entry, rank });
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.entry.order - b.entry.order);

  return scored.slice(0, limit).map((item) => item.entry);
}

/**
 * Sonuç satırının `Bölüm › Grup` yolu. Grup başlıksızsa (sapma #8) ya da başlığı çalışma zamanı
 * verisiyse sekme etiketi kullanılır — yol her zaman iki parçalıdır ve iki parça da sözlükten
 * gelir.
 */
export function buildSettingsSearchPath(entry: SettingsSearchEntry, t: SettingsTranslator): string {
  return [t(entry.sectionLabelKey), t(entry.groupTitleKey ?? entry.tabLabelKey)].join(
    SETTINGS_SEARCH_PATH_SEPARATOR,
  );
}
