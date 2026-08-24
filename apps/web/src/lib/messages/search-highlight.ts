import type { MessageMatchRange } from "@wizards/types";

/**
 * Arama sonucundaki eşleşme vurgusu — SPEC-MESAJLAR §6.2.
 *
 * Burada **arama yok**. Aralıklar sunucudan geliyor (`matchRanges`, Ş2) ve bu
 * modül yalnız onları parçalara böler. İstemcinin kendi eşleşmesini kurması,
 * sunucunun bulduğu satırda istemcinin başka bir yeri vurgulaması demek olurdu —
 * ve fark ancak Türkçe ünsüz yumuşamasında ortaya çıkar, yani en zor fark
 * edilecek yerde.
 *
 * Aralıklar **kod noktası** cinsindendir (`match-ranges.ts` böyle üretiyor).
 * `String.slice` UTF-16 kod birimi sayar; tek bir emoji bütün aralıkları
 * kaydırır ve `ğ`/`ı` gibi harflerin bulunduğu bir cümlede vurgu yanlış kelimeye
 * oturur. O yüzden metin önce kod noktası dizisine çevrilir.
 */

export type HighlightSegment = {
  highlighted: boolean;
  text: string;
};

/**
 * Aralıkları sıralar, çakışanları birleştirir ve metin sınırına kırpar.
 *
 * Çakışmayı birleştirmezsek iç içe iki `<mark>` doğar; sınıra kırpmazsak
 * sunucunun bir aralığı metnin dışına taşıp boş bir vurgu bırakır.
 */
export function normalizeMatchRanges(
  ranges: readonly MessageMatchRange[],
  length: number,
): MessageMatchRange[] {
  const clamped = ranges
    .map(([start, end]): MessageMatchRange => [
      Math.max(0, Math.min(start, length)),
      Math.max(0, Math.min(end, length)),
    ])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  const merged: MessageMatchRange[] = [];

  for (const range of clamped) {
    const previous = merged[merged.length - 1];

    if (previous && range[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], range[1]);
      continue;
    }

    merged.push([range[0], range[1]]);
  }

  return merged;
}

/** Metni vurgulu/vurgusuz parçalara böler; sıra korunur, hiçbir karakter düşmez. */
export function toHighlightSegments(
  text: string,
  ranges: readonly MessageMatchRange[],
): HighlightSegment[] {
  const points = Array.from(text);
  const normalized = normalizeMatchRanges(ranges, points.length);

  if (normalized.length === 0) {
    return text.length > 0 ? [{ highlighted: false, text }] : [];
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const [start, end] of normalized) {
    if (start > cursor) {
      segments.push({ highlighted: false, text: points.slice(cursor, start).join("") });
    }

    segments.push({ highlighted: true, text: points.slice(start, end).join("") });
    cursor = end;
  }

  if (cursor < points.length) {
    segments.push({ highlighted: false, text: points.slice(cursor).join("") });
  }

  return segments;
}
