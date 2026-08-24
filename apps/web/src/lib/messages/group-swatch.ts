import { getGroupAvatarColorTone, type GroupAvatarColor } from "@wizards/types";

/**
 * Grup tile'ının zemini ve mürekkebi — SPEC-MESAJLAR §7 adım 2.
 *
 * Tek yerde durmasının sebebi bir hata: `GROUP_AVATAR_COLORS` Dalga 0'da onaltılık
 * değerlerden **token adlarına** çevrildi, ve adları doğrudan CSS'e yazan her
 * yüzey (`backgroundColor: "primary"`) sessizce **hiçbir şey** çizer. Renk adını
 * gerçek bir renge çeviren tek bir çeviri olsun diye burada.
 *
 * `primary` / `success` / `warning` / `danger` uygulamanın token'ıdır ve
 * kullanıcının paletiyle birlikte değişir. `info` ve `accent`in `globals.css`'te
 * karşılığı yok; ikisi tasarımın onaylı iki değişmezidir ve token denetiminin
 * izin listesinde adları geçer.
 */
export const GROUP_SWATCH_BACKGROUND: Readonly<Record<string, string>> = Object.freeze({
  accent: "hsl(291 64% 55%)",
  danger: "hsl(var(--danger))",
  info: "hsl(199 89% 48%)",
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
});

/**
 * Açık zeminli üç swatch koyu mürekkep ister. `globals.css`'te karşılığı olan bir
 * token yok; değer token denetiminin izin listesindedir. Karşı taraf Tailwind'in
 * `text-white` sınıfıdır — ham bir onaltılık beyaz denetime takılır, ve haklı
 * olarak takılır.
 */
export const GROUP_SWATCH_DARK_INK = "hsl(222 30% 14%)";

export function getGroupSwatchBackground(color: string | null | undefined): string {
  return GROUP_SWATCH_BACKGROUND[color ?? "primary"] ?? GROUP_SWATCH_BACKGROUND.primary!;
}

/** Açık zeminde koyu mürekkep gerekiyorsa rengi verir, değilse `undefined`. */
export function getGroupSwatchInk(color: string | null | undefined): string | undefined {
  const known = color as GroupAvatarColor | null | undefined;

  if (!known || !(known in GROUP_SWATCH_BACKGROUND)) {
    return undefined;
  }

  return getGroupAvatarColorTone(known) === "dark" ? GROUP_SWATCH_DARK_INK : undefined;
}
