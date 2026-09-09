/**
 * `Yazı boyutu` (%85–130) — ölçek adımının **üstüne** binen çarpan (Ş8 §B.9).
 *
 * SPEC-ANA-SAYFA §8 kök font boyutunu görünüm alanına göre dört adımda sürüyor
 * (16 / 18 / 24 / 32 px, `lib/home/scale.ts`). Erişilebilirlik sekmesindeki yazı boyutu bunun
 * **yerine geçmez**: adım hangi ekranda olduğumuzu, çarpan kullanıcının ne kadar büyük metin
 * istediğini söyler. İkisini aynı yere yazmak birini sessizce yok ederdi — kullanıcı %130
 * seçtikten sonra pencereyi büyütünce yazı küçülürdü.
 *
 * Bu yüzden çarpan köke **ayrı bir nitelik** olarak yazılır (`data-text-scale`) ve nihai kök
 * font boyutu iki yazıcıda da aynı formülden çıkar: `adım × çarpan`. `applyUiScale` çarpanı
 * kökten okur, bu modül adımı kökten okur; hangisi sonra koşarsa koşsun sonuç aynıdır.
 */

/** Ölçek adımının DOM tutamağı — `hooks/use-ui-scale` ile ortak. */
export const TEXT_SCALE_ATTRIBUTE = "data-text-scale";

/** SPEC §5.3 — `x4` satırının aralığı. */
export const MIN_TEXT_SCALE_PERCENT = 85;
export const MAX_TEXT_SCALE_PERCENT = 130;
export const DEFAULT_TEXT_SCALE_PERCENT = 100;

export interface TextScaleRoot {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  readonly style: { fontSize: string };
}

export function clampTextScalePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TEXT_SCALE_PERCENT;
  }

  return Math.min(MAX_TEXT_SCALE_PERCENT, Math.max(MIN_TEXT_SCALE_PERCENT, Math.round(value)));
}

/** Kökte yazılı çarpan; hiç yazılmamışsa 1. */
export function readTextScaleMultiplier(root: Pick<TextScaleRoot, "getAttribute">): number {
  const raw = Number(root.getAttribute(TEXT_SCALE_ATTRIBUTE));

  if (!Number.isFinite(raw) || raw <= 0) {
    return 1;
  }

  return clampTextScalePercent(raw) / 100;
}

/** İki yazıcının paylaştığı **tek** formül. Yuvarlama 0,01 px — alt piksel titremesini keser. */
export function composeRootFontSize(stepPx: number, multiplier: number): string {
  return `${Math.round(stepPx * multiplier * 100) / 100}px`;
}

/**
 * Çarpanı köke yazar ve verilen adımla birleştirir.
 *
 * Adım **dışarıdan** gelir (`selectUiScale(...).rootFontSizePx`); bu modül ölçek motorundan
 * hiçbir şey import etmez ve karşılığında ölçek motoru bu modülü import edebilir. Tek yönlü
 * bağımlılık, iki yazıcının aynı formülü paylaşmasının bedeli olarak bir döngü doğmasını
 * engeller.
 */
export function applyTextScaleToDocument(
  root: TextScaleRoot,
  percent: number,
  stepPx: number,
): number {
  const clamped = clampTextScalePercent(percent);
  root.setAttribute(TEXT_SCALE_ATTRIBUTE, String(clamped));
  root.style.fontSize = composeRootFontSize(stepPx > 0 ? stepPx : 16, clamped / 100);

  return clamped;
}
