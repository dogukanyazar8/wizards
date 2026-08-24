import type { MessageMatchRange } from "@wizards/types";

/**
 * Arama sonucundaki vurgu aralıkları — SPEC §6.2.
 *
 * Aralıklar **kod noktası** cinsindendir, bayt değil. `yoğunluğu` dokuz karakter
 * ve on bir bayttır; bayt aralığı vurguyu harfin ortasından keserdi. UTF-16 kod
 * birimi de emoji'de yanılır. `Array.from(text)` tam olarak bunu indeksler.
 *
 * Hesap sunucuda yapılır ve DTO'da taşınır: istemci aynı aramayı ikinci kez
 * yapsaydı, eşleşen kelimeyi bulma kuralının iki kopyası olurdu ve biri
 * sessizce diğerinden sapardı.
 *
 * ## Neden düz `indexOf` yetmez
 *
 * Tasarım `yoğunluk` sorgusu için `yoğunluğu` kelimesini vurguluyor. Türkçede
 * ünsüz yumuşaması gövdeyi değiştirir (`k → ğ`), yani ne biri diğerinin alt
 * dizesidir ne de öneki. Veritabanı tarafındaki eşleşme zaten iki yolludur
 * (İngilizce tsvector **veya** `ILIKE`), o yüzden burada da iki aşama var:
 *
 * 1. Tam alt dize — bulunduğu her yerde vurgulanır.
 * 2. Bulunamazsa, **ortak önek** kuralı: bir kelime, sorgu terimiyle yeterince
 *    uzun bir önek paylaşıyorsa bütün olarak vurgulanır.
 *
 * İkinci aşama bir sezgiseldir ve öyle olduğu bilinerek yazılmıştır: eşleşmeyi
 * getiren sorgu ile vurguyu koyan kural aynı şey değildir, ve ikisinin ayrıldığı
 * yerde vurgu eksik kalır — yanlış kalmaz.
 */

/**
 * Ortak önek eşiğinin tabanı. Dört harften kısa bir terimde kural zaten hiç
 * çalışmaz: eşik terimin tamamına çıkar, tamamı önekse kelime terimle başlıyor
 * demektir ve o zaten birinci aşamada alt dize olarak bulunmuştur.
 */
const MIN_PREFIX_LENGTH = 4;

/** Terimin en az bu kadarı tutmalı. 8 harflik `yoğunluk` için 6. */
const PREFIX_RATIO = 0.75;

/** Sözcük sınırı: harf ve rakam. `\p{L}` Türkçe harfleri kapsar. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function lower(value: string): string {
  // `toLocaleLowerCase("tr")` `I`'yı `ı` yapar; İngilizce büyük harfli bir
  // kelimeyi Türkçe kurala göre küçültmek `Istanbul`/`ıstanbul` gibi tek yönlü
  // bir sapmadır ama arama zaten aynı kuralla yazılmış metinde çalışıyor.
  return value.toLocaleLowerCase("tr");
}

function commonPrefixLength(left: readonly string[], right: readonly string[]): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

/** `haystack` içinde `needle`'ın **kod noktası** indeksi, ya da `-1`. */
function indexOfSequence(
  haystack: readonly string[],
  needle: readonly string[],
  from: number,
): number {
  if (needle.length === 0 || needle.length > haystack.length) {
    return -1;
  }

  outer: for (let start = Math.max(0, from); start <= haystack.length - needle.length; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        continue outer;
      }
    }

    return start;
  }

  return -1;
}

/** Kod noktası dizisindeki sözcükler, başlangıç indeksleriyle. */
function splitWords(characters: readonly string[]): { characters: string[]; start: number }[] {
  const words: { characters: string[]; start: number }[] = [];
  let current: string[] = [];
  let start = 0;

  characters.forEach((character, index) => {
    if (WORD_CHARACTER.test(character)) {
      if (current.length === 0) {
        start = index;
      }

      current.push(character);
      return;
    }

    if (current.length > 0) {
      words.push({ characters: current, start });
      current = [];
    }
  });

  if (current.length > 0) {
    words.push({ characters: current, start });
  }

  return words;
}

function mergeRanges(ranges: MessageMatchRange[]): MessageMatchRange[] {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: MessageMatchRange[] = [sorted[0]!];

  for (const range of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;

    if (range[0] <= last[1]) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], range[1])];
      continue;
    }

    merged.push(range);
  }

  return merged;
}

/**
 * `[başlangıç, bitiş)` çiftleri, kod noktası cinsinden, artan sırada ve
 * çakışmasız.
 */
export function findMatchRanges(text: string, query: string): MessageMatchRange[] {
  const terms = [
    ...new Set(
      lower(query)
        .split(/\s+/)
        .filter((term) => term.length > 0),
    ),
  ];

  if (terms.length === 0 || text.length === 0) {
    return [];
  }

  // Kod noktası dizileri. Arama bu diziler üzerinde yürür, birleştirilmiş dize
  // üzerinde **değil**: `String.prototype.indexOf` UTF-16 kod birimi döndürür ve
  // metindeki tek bir emoji bütün aralıkları bir kaydırırdı.
  const characters = Array.from(text);
  const lowered = Array.from(lower(text));

  // `lower()` bazı harflerde uzunluk değiştirebilir (`İ` → `i̇`). Değiştiyse
  // aralıklar kayardı; boş dönmek yanlış yeri vurgulamaktan iyidir.
  if (lowered.length !== characters.length) {
    return [];
  }

  const ranges: MessageMatchRange[] = [];

  for (const term of terms) {
    const needle = Array.from(term);
    let found = false;

    // 1. Tam alt dize.
    let from = indexOfSequence(lowered, needle, 0);
    while (from !== -1) {
      found = true;
      ranges.push([from, from + needle.length]);
      from = indexOfSequence(lowered, needle, from + needle.length);
    }

    if (found) {
      continue;
    }

    // 2. Ortak önek.
    const threshold = Math.max(MIN_PREFIX_LENGTH, Math.ceil(needle.length * PREFIX_RATIO));

    for (const word of splitWords(lowered)) {
      if (commonPrefixLength(word.characters, needle) >= threshold) {
        ranges.push([word.start, word.start + word.characters.length]);
      }
    }
  }

  return mergeRanges(ranges);
}
