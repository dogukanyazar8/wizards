/**
 * Sunucu ikonunun renk tonu — SPEC-SUNUCU §7 (oluşturma penceresi) ve §8.1 (Genel bölümü).
 *
 * Altı swatch bir **token adı** taşır, renk değil: tüketici `hsl(var(--primary))` /
 * `hsl(var(--accent-2))` ile boyar. Sözleşme (`SERVER_ICON_TONES`) `accent2` yazar çünkü zod
 * enum'u bir tanımlayıcıdır; CSS değişkeni `--accent-2`. İkisi arasındaki tek köprü aşağıdaki
 * haritadır — bileşenlerin `tone.replace("2", "-2")` gibi bir dönüşüm uydurması, yedinci bir
 * ton eklendiği gün sessizce yanlış değişkene bakardı.
 *
 * `iconColor` `null` ise (kolonun varsayılanı ve `Kaldır` düğmesinin sonucu) ton kısa addan
 * **deterministik** türetilir: harf kodları toplamı % palet uzunluğu. Türetme burada yaşar ki
 * ray, oluşturma önizlemesi ve ayarların Genel bölümü aynı sunucuya aynı rengi versin.
 */

import { SERVER_ICON_TONES, type ServerIconTone } from "@wizards/types";

/** Ton adı → CSS değişkeni. Sıra SPEC §7'nin swatch sırasıdır. */
const SERVER_ICON_TONE_VARIABLES: Record<ServerIconTone, string> = {
  accent2: "--accent-2",
  danger: "--danger",
  info: "--info",
  primary: "--primary",
  success: "--success",
  warning: "--warning",
};

/** Swatch satırının soldan sağa sırası — SPEC §7: primary · info · success · warning · danger · accent-2. */
export const SERVER_ICON_TONE_ORDER: readonly ServerIconTone[] = SERVER_ICON_TONES;

export function getServerIconToneVariable(tone: ServerIconTone): string {
  return SERVER_ICON_TONE_VARIABLES[tone];
}

/** Dolu zemin: `hsl(var(--primary))`. Alfa verilirse `hsl(var(--primary)/.16)`. */
export function getServerIconToneColor(tone: ServerIconTone, alpha?: number): string {
  const variable = getServerIconToneVariable(tone);

  return alpha === undefined ? `hsl(var(${variable}))` : `hsl(var(${variable}) / ${alpha})`;
}

/**
 * `Sunucu.dc.html` satır 2205'in aynısı:
 * `PAL[csShortView.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length]`.
 *
 * `Array.from` ile dolaşılır, `split("")` ile değil: emoji ya da BMP dışı bir kısa ad
 * `split("")` altında vekil çiftlerine bölünür ve toplam iki farklı istemcide iki farklı
 * renk üretirdi.
 */
export function deriveServerIconTone(shortName: string): ServerIconTone {
  const sum = Array.from(shortName).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );

  return SERVER_ICON_TONE_ORDER[sum % SERVER_ICON_TONE_ORDER.length]!;
}

/**
 * Gösterilecek ton: seçim varsa o, yoksa türetme. `iconColor` `null` **ve** `undefined`
 * aynı görünür sonucu verir; ikisinin ayrımı yalnız yazma tarafında (Ş1 sözleşmesi) anlamlıdır.
 */
export function resolveServerIconTone(
  iconColor: ServerIconTone | null | undefined,
  shortName: string,
): ServerIconTone {
  return iconColor ?? deriveServerIconTone(shortName);
}
