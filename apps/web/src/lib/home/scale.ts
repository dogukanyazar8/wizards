/**
 * Kök font boyutu ölçek motoru — SPEC §8.1.
 *
 * Tasarımın tüm px değerleri ×1 ölçekteki (1360×920 kabuk) tasarım pikselidir ve rem'e çevrilir
 * (`metrics.pxToRem`). Ekran büyüdükçe kompozisyon değişmez; yalnız kök font boyutu adım adım
 * yükselir ve rem tabanlı her ölçü onunla birlikte büyür. Bu otomatik büyütme yalnız web
 * görünümüne uygulanır; masaüstünde pencere büyümesi içerik boyutunu değiştirmez.
 *
 * Bu modül **saf**tır: DOM'a dokunmaz, tarayıcı API'si okumaz. Uygulayıcı `@/hooks/use-ui-scale`.
 */

import { HOME_METRICS } from "./metrics";

export type UiScaleValue = 1 | 1.15 | 1.5 | 2;

export type UiScaleAttribute = "1" | "1.15" | "1.5" | "2";

export type UiScalePlatform = "web" | "desktop";

export interface UiScaleStep {
  /** `data-ui-scale` niteliğinin değeri; testlerin ve CSS istisnalarının tutamağı. */
  readonly attribute: UiScaleAttribute;
  /** `document.documentElement.style.fontSize` değeri. */
  readonly rootFontSizePx: number;
  readonly scale: UiScaleValue;
}

const STEP_X1: UiScaleStep = Object.freeze({ attribute: "1", rootFontSizePx: 16, scale: 1 });
const STEP_X115: UiScaleStep = Object.freeze({
  attribute: "1.15",
  rootFontSizePx: 18,
  scale: 1.15,
});
const STEP_X15: UiScaleStep = Object.freeze({ attribute: "1.5", rootFontSizePx: 24, scale: 1.5 });
const STEP_X2: UiScaleStep = Object.freeze({ attribute: "2", rootFontSizePx: 32, scale: 2 });

/** Artan sırada; seçim bu sıraya güvenir. */
export const UI_SCALE_STEPS: readonly UiScaleStep[] = Object.freeze([
  STEP_X1,
  STEP_X115,
  STEP_X15,
  STEP_X2,
]);

/** SPEC §8.1 tabanı — sözlükten okunur, burada ikinci bir kopyası tutulmaz. */
const BASE_WIDTH = HOME_METRICS.shell.minWidth;
const BASE_HEIGHT = HOME_METRICS.shell.minHeight;

/** Kayan nokta artığı bir adımı haksız yere düşürmesin diye. */
const EPSILON = 1e-9;

export interface UiScaleViewport {
  readonly height: number;
  readonly width: number;
}

/**
 * Web görünüm alanına düşen ölçek adımı (SPEC §8.1). Masaüstü her ölçüde ×1 kullanır.
 *
 * 1. `fit = min(width / 1360, height / 920)` — seçim **her iki eksene** bakar (§6.2).
 * 2. `fit` değerini geçmeyen en yüksek adım seçilir.
 * 3. Ölçekten sonra kalan düzen alanı en az 1360×920 CSS px olmalı; değilse bir alt adım.
 * 4. ×2 üst sınırdır; 5K/8K'da da ×2'de kalınır.
 *
 * Ölçülemeyen görünüm alanı (SSR öncesi, sıfır, negatif, `NaN`) taban adıma düşer.
 */
export function selectUiScale(
  viewport: UiScaleViewport,
  platform: UiScalePlatform = "web",
): UiScaleStep {
  // Native DPI ve kullanıcının yazı boyutu tercihi ayrıca uygulanır. Pencereyi
  // büyütmek bunların üstüne ikinci bir otomatik büyütme eklememeli.
  if (platform === "desktop") return STEP_X1;

  const { height, width } = viewport;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return STEP_X1;
  }

  const fit = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

  let index = 0;
  for (let candidate = 1; candidate < UI_SCALE_STEPS.length; candidate += 1) {
    const step = UI_SCALE_STEPS[candidate];
    if (!step || step.scale > fit + EPSILON) break;
    index = candidate;
  }

  // §8.1'in tek şartı. `fit` zaten iki eksenden türediği için bu döngü pratikte dönmez; kural
  // sözleşmenin parçası olduğu için açıkça korunur.
  while (index > 0) {
    const step = UI_SCALE_STEPS[index];
    if (!step) break;
    const fitsVertically = height / step.scale >= BASE_HEIGHT - EPSILON;
    const fitsHorizontally = width / step.scale >= BASE_WIDTH - EPSILON;
    if (fitsVertically && fitsHorizontally) break;
    index -= 1;
  }

  return UI_SCALE_STEPS[index] ?? STEP_X1;
}
