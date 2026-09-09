/**
 * Rol rengi — SPEC-SUNUCU §8.5 `Renk` swatch'ları.
 *
 * Tasarım altı swatch veriyor ve altısı da bir **token** adı taşıyor:
 * `text-muted · info · success · warning · danger · primary`. Üründe `Role.color` bir
 * **tamsayı** kolonu (`Int`, 0…0xFFFFFF) ve mobil istemci onu doğrudan boyayarak çiziyor.
 * Yani iki temsil zorunlu: ekranda token, veritabanında tamsayı.
 *
 * Köprü **tek** burada. `server-icon-tone.ts` aynı problemi ikon tonu için çözüyor; oradaki
 * gerekçe burada da geçerli: bileşenin `tone === "danger" ? 0xef435a : …` gibi bir dönüşüm
 * uydurması, yedinci bir ton eklendiği gün sessizce yanlış rengi yazardı.
 *
 * ---
 *
 * **Tamsayılar nereden geliyor?** `globals.css`'in **temel** paletindeki (`:root`) HSL
 * değerlerinin sRGB karşılığı:
 *
 * | Ton | `globals.css` | sRGB |
 * | --- | --- | --- |
 * | `textMuted` | `220 11% 46%` | `#687182` |
 * | `info` | `199 89% 48%` | `#0DA2E7` |
 * | `success` | `154 60% 42%` | `#2BAB74` |
 * | `warning` | `39 90% 56%` | `#F4AD2A` |
 * | `danger` | `352 84% 60%` | `#EF435A` |
 * | `primary` | `235 86% 65%` | `#5966F3` |
 *
 * Web tarafı bu sayıyı **çizmez** — nokta ve swatch her zaman `hsl(var(--token))` ile boyanır,
 * yani kullanıcının paleti ve teması neyse ona uyar. Sayı yalnız kalıcı **kimliktir** ve token
 * kavramı olmayan istemcilerin (mobil rol rozeti) makul bir renk görmesini sağlar. Palete göre
 * değişen bir sayı kaydetmek, temayı değiştiren kullanıcının kayıtlı rol renklerini de
 * değiştirirdi.
 *
 * **Ters yön:** kayıtlı sayı altı değerden biri değilse (eski roller, `DEFAULT_ROLE_COLOR`
 * gibi ürünün eski paleti, bot tarafından yönetilen roller) en yakın ton sRGB uzaklığıyla
 * seçilir. Alternatif "yedinci swatch" açmaktı; o da tasarımda olmayan bir kontrol demekti.
 */

/** Swatch satırının soldan sağa sırası — SPEC §8.5. */
export const SERVER_ROLE_TONES = [
  "textMuted",
  "info",
  "success",
  "warning",
  "danger",
  "primary",
] as const;

export type ServerRoleTone = (typeof SERVER_ROLE_TONES)[number];

/** Yeni rol taslağının varsayılan rengi — SPEC §8.5 "renk varsayılan primary". */
export const DEFAULT_ROLE_TONE: ServerRoleTone = "primary";

const ROLE_TONE_VARIABLES: Record<ServerRoleTone, string> = {
  danger: "--danger",
  info: "--info",
  primary: "--primary",
  success: "--success",
  textMuted: "--text-muted",
  warning: "--warning",
};

const ROLE_TONE_COLORS: Record<ServerRoleTone, number> = {
  danger: 0xef_43_5a,
  info: 0x0d_a2_e7,
  primary: 0x59_66_f3,
  success: 0x2b_ab_74,
  textMuted: 0x68_71_82,
  warning: 0xf4_ad_2a,
};

export function getRoleToneVariable(tone: ServerRoleTone): string {
  return ROLE_TONE_VARIABLES[tone];
}

/** Dolu zemin: `hsl(var(--danger))`. Alfa verilirse `hsl(var(--danger) / 0.14)`. */
export function getRoleToneColor(tone: ServerRoleTone, alpha?: number): string {
  const variable = getRoleToneVariable(tone);

  return alpha === undefined ? `hsl(var(${variable}))` : `hsl(var(${variable}) / ${alpha})`;
}

/** Ton → `Role.color`. Yazma yönü; kayıt bu sayıyı tutar. */
export function roleToneToColor(tone: ServerRoleTone): number {
  return ROLE_TONE_COLORS[tone];
}

function channelDistance(left: number, right: number): number {
  const dr = ((left >> 16) & 0xff) - ((right >> 16) & 0xff);
  const dg = ((left >> 8) & 0xff) - ((right >> 8) & 0xff);
  const db = (left & 0xff) - (right & 0xff);

  return dr * dr + dg * dg + db * db;
}

/**
 * `Role.color` → ton. Birebir eşleşme yoksa sRGB'de en yakın swatch seçilir; eşitlikte
 * `SERVER_ROLE_TONES` sırasındaki ilk ton kazanır, böylece sonuç her istemcide aynıdır.
 */
export function roleColorToTone(color: number): ServerRoleTone {
  const value = Number.isFinite(color) ? Math.max(0, Math.min(0xff_ff_ff, Math.trunc(color))) : 0;

  let best: ServerRoleTone = SERVER_ROLE_TONES[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const tone of SERVER_ROLE_TONES) {
    const distance = channelDistance(value, ROLE_TONE_COLORS[tone]);

    if (distance < bestDistance) {
      best = tone;
      bestDistance = distance;
    }
  }

  return best;
}
