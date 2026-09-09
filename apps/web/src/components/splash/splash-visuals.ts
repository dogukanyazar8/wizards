import { SPLASH_STATE_TEXT_KEYS, type SplashStateId } from "@wizards/types";

/**
 * SPEC-SPLASH §7 tablosunun görsel yarısı.
 *
 * Kontrast kuralı tipe kazınmıştır: `tone` **metin** rengidir ve daima `-soft`
 * (ya da `-readable`) varyantıdır; `tile` doygun tonun tint'idir ve yalnız zemin
 * olarak kullanılır. İkisi ayrı alanlar olduğu için karıştırılamazlar — SPEC'in
 * "10px uppercase etiketi doygun tonda yazmak beyaz zeminde 1.9:1'e düşer"
 * uyarısı böyle kapanır.
 */

export type SplashStateVisual = {
  /** Karo zemininin arkasındaki aurora yıkaması. */
  readonly wash: string;
  /** `stroke="currentColor"` ile çizilen 24×24 ikon yolu (referans dosyadan birebir). */
  readonly icon: string;
  /** Eylem düğmesinin tonu; `updating` düğme değil ilerleme çubuğu gösterir. */
  readonly action: "primary" | "ghost" | null;
  readonly text: (typeof SPLASH_STATE_TEXT_KEYS)[keyof typeof SPLASH_STATE_TEXT_KEYS];
  /** Karo zemini — doygun ton, yalnız tint olarak. */
  readonly tile: string;
  /** Etiket ve ikon rengi — okunur (koyu/açık) varyant. */
  readonly tone: string;
};

export type SplashVisualStateId = Exclude<SplashStateId, "loading">;

export const SPLASH_STATE_VISUALS: Record<SplashVisualStateId, SplashStateVisual> = {
  offline: {
    action: "primary",
    icon: "M12 9v4m0 3.5v.01M10.3 4.3 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.3a1.5 1.5 0 0 0-2.6 0Z",
    text: SPLASH_STATE_TEXT_KEYS.offline,
    tile: "hsl(var(--danger) / 0.18)",
    tone: "hsl(var(--danger-soft))",
    wash: "hsl(var(--danger) / 0.16)",
  },
  sessionExpired: {
    action: "primary",
    icon: "M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h9",
    text: SPLASH_STATE_TEXT_KEYS.sessionExpired,
    tile: "hsl(var(--surface-soft))",
    tone: "hsl(var(--text-secondary))",
    wash: "hsl(var(--foreground) / 0.08)",
  },
  slow: {
    action: "ghost",
    icon: "M12 8v4l2.5 2.5M12 3a9 9 0 1 0 9 9",
    text: SPLASH_STATE_TEXT_KEYS.slow,
    tile: "hsl(var(--warning) / 0.22)",
    tone: "hsl(var(--warning-soft))",
    wash: "hsl(var(--warning) / 0.16)",
  },
  updating: {
    action: null,
    icon: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
    text: SPLASH_STATE_TEXT_KEYS.updating,
    tile: "hsl(var(--primary) / 0.14)",
    /*
     * SPEC tablosu bu satırın metnini doygun `--primary` yazıyor, ama o beyaz
     * kartta 3,4:1 veriyor ve §10'un beşinci kabul kriteri (≥ 4,5:1) düşüyor.
     * Depoda bu tam sorun için türetilmiş token var: `--primary-readable`,
     * `--primary`i temanın `--foreground`'una karıştırır, yani açık temada
     * koyulaşır, koyuda açılır. Ton ailesi ve karo tint'i değişmedi.
     */
    tone: "var(--primary-readable)",
    wash: "hsl(var(--primary) / 0.2)",
  },
};

/** Onay ikonunun yolu (SPEC §3.5 tamamlanan adımı). */
export const SPLASH_STEP_DONE_ICON = "m4 12.5 5 5 11-11";

export function getSplashStateVisual(state: SplashStateId): SplashStateVisual | null {
  return state === "loading" ? null : SPLASH_STATE_VISUALS[state];
}
