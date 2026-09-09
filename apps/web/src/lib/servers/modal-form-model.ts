import { SERVER_METRICS } from "./metrics";

/**
 * Sunucu pencerelerinin **saf** kararları — sayaç eşiği, kategori önizlemesi, kanal adı ve
 * ayak özeti.
 *
 * Bunlar JSX'in içinde kalsaydı yalnız bir tarayıcı testiyle doğrulanabilirlerdi; oysa üçü de
 * kabul kriterinde adı geçen kurallar (00 §6: "%85'i geçince warning" ve "ayak özeti üç
 * durumda da doğru"). Metin **üretilmez**: özet bir varyant
 * döner, cümleyi çağıran `t()` ile kurar — sözlük tek yerde kalır (00 §7).
 */

/** SPEC §6.1/§6.2 sayaçları: sınırın `%85`ini **geçince** warning'e döner. */
export function isCounterWarning(length: number, max: number): boolean {
  return length > max * SERVER_METRICS.modal.counterWarnRatio;
}

/**
 * Kenar çubuğu önizlemesindeki ad. Boşken SPEC'in `YENİ KATEGORİ` yer tutucusu döner; doluyken
 * ad büyük harfe çevrilir.
 *
 * Büyük harf `tr-TR` yerelinde alınır: `i` harfi İngilizce kuralla `I` olur ve "İletişim"
 * kenar çubuğunda "ILETISIM" diye görünürdü.
 */
export function categoryPreviewName(name: string, emptyFallback: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed.toLocaleUpperCase("tr-TR") : emptyFallback;
}

/** Yazma şemasıyla aynı şekilde yalnız dış boşluğu kırpar; kullanıcının yazımını korur. */
export function previewChannelName(name: string): string {
  return name.trim();
}

/**
 * Ayak özetinin üç durumu. Cümleyi çağıran kurar; burada yalnız **hangi** cümle olduğu ve
 * içine girecek ad kararlaştırılır.
 */
export type ChannelFooterSummary =
  { kind: "empty" } | { kind: "text"; name: string } | { kind: "voice" };

export function channelFooterSummary(name: string, type: "TEXT" | "VOICE"): ChannelFooterSummary {
  if (!name.trim()) {
    return { kind: "empty" };
  }

  return type === "VOICE" ? { kind: "voice" } : { kind: "text", name: previewChannelName(name) };
}
