import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * SPEC-SPLASH §7 kontrast kuralının denetimi.
 *
 * Durum etiketleri her zaman `-soft` tonunda yazılır; doygun `--warning`/`--danger`
 * yalnız karo zemininin tint'inde kullanılır. Bu ancak `-soft` tokenları temanın
 * zeminine göre doğruysa tutar: `:root` değerleri koyu metin tonlarıdır ve koyu
 * paletlerde zemine gömülürler.
 *
 * Test iki şeyi birden ölçer, çünkü ikisi ayrı ayrı yeşil olup birlikte yanlış
 * olabiliyor: (1) koyu her paletin dört `-soft` tokenını **kendi** tanımlaması,
 * (2) her tonun hem çıplak kart zemininde hem kendi tint'li karosunda AA eşiğini
 * geçmesi.
 */

const GLOBALS_CSS_PATH = path.join(process.cwd(), "src", "app", "globals.css");

const WCAG_AA_CONTRAST = 4.5;

/** SPEC §3.3 pill ve §7 karo zeminlerinin alfa değerleri; en kötü hâl ölçülür. */
const TONE_TINT_ALPHAS = {
  danger: [0.18],
  info: [0.16],
  success: [0.14],
  warning: [0.18, 0.22],
} as const;

type ToneName = keyof typeof TONE_TINT_ALPHAS;

const TONE_NAMES = Object.keys(TONE_TINT_ALPHAS) as ToneName[];

type Hsl = { hue: number; lightness: number; saturation: number };
type Rgb = { blue: number; green: number; red: number };

function parseHslTriple(value: string): Hsl | null {
  const [rawHue, rawSaturation, rawLightness] = value.trim().split(/\s+/);

  if (rawHue === undefined || rawSaturation === undefined || rawLightness === undefined) {
    return null;
  }

  const hue = Number.parseFloat(rawHue);
  const saturation = Number.parseFloat(rawSaturation);
  const lightness = Number.parseFloat(rawLightness);

  if (!Number.isFinite(hue) || !Number.isFinite(saturation) || !Number.isFinite(lightness)) {
    return null;
  }

  return { hue, lightness, saturation };
}

function hslToRgb({ hue, lightness, saturation }: Hsl): Rgb {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = saturation / 100;
  const l = lightness / 100;

  if (s === 0) {
    return { blue: l, green: l, red: l };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const channel = (offset: number) => {
    const t = (((h + offset) % 1) + 1) % 1;

    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }

    if (t < 1 / 2) {
      return q;
    }

    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }

    return p;
  };

  return { blue: channel(-1 / 3), green: channel(0), red: channel(1 / 3) };
}

function relativeLuminance({ blue, green, red }: Rgb): number {
  const linear = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);

  return (lighter + 0.05) / (darker + 0.05);
}

function compositeOver(foreground: Rgb, alpha: number, background: Rgb): Rgb {
  return {
    blue: foreground.blue * alpha + background.blue * (1 - alpha),
    green: foreground.green * alpha + background.green * (1 - alpha),
    red: foreground.red * alpha + background.red * (1 - alpha),
  };
}

type TokenMap = Map<string, string>;

/**
 * `selector { … }` bloklarını sığ biçimde okur.
 *
 * `@media`/`@layer` sarmalayıcıları dışta kalır çünkü desen yalnız en içteki
 * (süslü parantez içermeyen) gövdeleri eşler — token tanımları zaten orada.
 */
function readCssBlocks(css: string): Array<{ declarations: TokenMap; selectors: string[] }> {
  const blocks: Array<{ declarations: TokenMap; selectors: string[] }> = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;

  let match = blockPattern.exec(css);

  while (match !== null) {
    // `noUncheckedIndexedAccess` altında yakalama grupları `string | undefined`; gövde döngü
    // dışında bir kez okunuyor ki iç döngü `match`in daralmasına bel bağlamasın.
    const rawSelector = (match[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const blockBody = match[2] ?? "";
    const declarations: TokenMap = new Map();
    const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;

    let declaration = declarationPattern.exec(blockBody);

    while (declaration !== null) {
      const [, token, value] = declaration;

      if (token !== undefined && value !== undefined) {
        declarations.set(token, value.trim());
      }

      declaration = declarationPattern.exec(blockBody);
    }

    if (rawSelector.length > 0 && declarations.size > 0) {
      blocks.push({
        declarations,
        selectors: rawSelector
          .split(",")
          .map((selector) => selector.trim())
          .filter((selector) => selector.length > 0),
      });
    }

    match = blockPattern.exec(css);
  }

  return blocks;
}

type ThemePalette = {
  selector: string;
  tokens: TokenMap;
};

/**
 * Her tema seçicisi için, dosya sırasına göre birleştirilmiş token kümesi.
 *
 * `:root` taban; `html.theme-*` blokları onun üstüne yazar. Bileşen kapsamlı
 * seçiciler (`html.theme-dark .messages-reference-surface` gibi) tema değil,
 * yüzeydir — palet listesine girmezler.
 */
function collectThemePalettes(css: string): ThemePalette[] {
  const blocks = readCssBlocks(css);
  const rootTokens: TokenMap = new Map();
  const themeTokens = new Map<string, TokenMap>();

  for (const block of blocks) {
    for (const selector of block.selectors) {
      const isRoot = selector === ":root";
      const isThemeRoot = /^html\.theme-[\w-]+$/.test(selector);

      if (!isRoot && !isThemeRoot) {
        continue;
      }

      const target = isRoot ? rootTokens : (themeTokens.get(selector) ?? new Map());

      for (const [token, value] of block.declarations) {
        target.set(token, value);
      }

      if (!isRoot) {
        themeTokens.set(selector, target);
      }
    }
  }

  const palettes: ThemePalette[] = [
    { selector: ":root", tokens: new Map(rootTokens) },
    ...[...themeTokens.entries()].map(([selector, tokens]) => ({
      selector,
      tokens: new Map([...rootTokens, ...tokens]),
    })),
  ];

  return palettes.sort((left, right) => left.selector.localeCompare(right.selector));
}

function requireHsl(palette: ThemePalette, token: string): Hsl {
  const raw = palette.tokens.get(token);
  assert.ok(raw, `${palette.selector} defines no ${token}.`);

  const parsed = parseHslTriple(raw);
  assert.ok(parsed, `${palette.selector} ${token} is not a bare HSL triple: ${raw}`);

  return parsed;
}

const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf8");
const palettes = collectThemePalettes(globalsCss);
const darkPalettes = palettes.filter(
  (palette) => requireHsl(palette, "--surface-card").lightness < 50,
);

describe("splash status tones", () => {
  it("reads every palette from globals.css", () => {
    assert.ok(palettes.length > 20, `Only ${palettes.length} palettes were parsed.`);
    assert.ok(darkPalettes.length > 10, `Only ${darkPalettes.length} dark palettes were parsed.`);
  });

  it("gives every dark palette its own -soft tokens", () => {
    const blocks = readCssBlocks(globalsCss);
    const darkSelectors = new Set(darkPalettes.map((palette) => palette.selector));

    for (const selector of darkSelectors) {
      const owned = blocks
        .filter((block) => block.selectors.includes(selector))
        .flatMap((block) => [...block.declarations.keys()]);

      for (const tone of TONE_NAMES) {
        assert.ok(
          owned.includes(`--${tone}-soft`),
          `${selector} inherits the light --${tone}-soft; dark palettes must override it.`,
        );
      }
    }
  });

  it("keeps every -soft tone readable on its own card and tint", () => {
    for (const palette of palettes) {
      const card = hslToRgb(requireHsl(palette, "--surface-card"));

      for (const tone of TONE_NAMES) {
        const text = hslToRgb(requireHsl(palette, `--${tone}-soft`));
        const base = hslToRgb(requireHsl(palette, `--${tone}`));
        const backgrounds = [
          card,
          ...TONE_TINT_ALPHAS[tone].map((alpha) => compositeOver(base, alpha, card)),
        ];

        for (const background of backgrounds) {
          const ratio = contrastRatio(text, background);
          assert.ok(
            ratio >= WCAG_AA_CONTRAST,
            `${palette.selector} --${tone}-soft scores ${ratio.toFixed(2)}:1 (needs ${WCAG_AA_CONTRAST}:1).`,
          );
        }
      }
    }
  });
});
