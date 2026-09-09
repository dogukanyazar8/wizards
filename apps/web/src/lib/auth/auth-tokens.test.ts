import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * `design_handoff/giris-kayit-paketi/SPEC.md` §1.1 / §1.2 token tablolarının denetimi.
 *
 * Paket kararı K5: tasarımın token değerleri **yalnız auth yüzeyinde** tanımlanır, çünkü SPEC'in
 * koyu teması ürünün 20+ koyu paletiyle uyuşmuyor ve ürünün `-soft` üçlüleri ölçülmüş bir
 * kontrast invaryantını taşıyor (`splash-contrast.test.ts`). Bu test üç şeyi birden tutar:
 * (1) auth bloğundaki her token SPEC değerinde, (2) `--surface-inset` auth dışına sızmamış,
 * (3) `-soft` metin tonları kendi kart zemininde AA eşiğini geçiyor (SPEC §12/6).
 */

const GLOBALS_CSS_PATH = path.join(process.cwd(), "src", "app", "globals.css");

const WCAG_AA_CONTRAST = 4.5;

/** SPEC §1.1 — açık tema. */
const LIGHT_TOKENS: Record<string, string> = {
  "--background": "220 23% 98%",
  "--border": "220 20% 84%",
  "--danger": "352 84% 60%",
  "--danger-soft": "352 70% 30%",
  "--foreground": "222 26% 14%",
  "--primary": "235 86% 65%",
  "--primary-foreground": "0 0% 100%",
  "--success": "154 60% 42%",
  "--success-soft": "154 46% 22%",
  "--surface-card": "0 0% 100%",
  "--surface-inset": "220 24% 96%",
  "--surface-soft": "220 24% 91%",
  "--text-muted": "220 11% 52%",
  "--text-secondary": "220 16% 38%",
  "--warning": "39 90% 56%",
  "--warning-soft": "34 55% 22%",
};

/** SPEC §1.2 — koyu tema. */
const DARK_TOKENS: Record<string, string> = {
  "--background": "222 26% 9%",
  "--border": "222 15% 27%",
  "--danger": "352 84% 66%",
  "--danger-soft": "352 88% 82%",
  "--foreground": "220 22% 96%",
  "--primary": "235 86% 68%",
  "--primary-foreground": "0 0% 100%",
  "--success": "154 55% 48%",
  "--success-soft": "154 58% 76%",
  "--surface-card": "222 22% 13%",
  "--surface-inset": "222 20% 16%",
  "--surface-soft": "222 16% 22%",
  "--text-muted": "220 12% 60%",
  "--text-secondary": "220 14% 74%",
  "--warning": "39 92% 62%",
  "--warning-soft": "39 85% 78%",
};

type Rgb = { blue: number; green: number; red: number };

function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS_PATH, "utf8");
}

/** Yorumlar bildirim ayrıştırmasını bozuyor (`;` ile bölünen parça `/*` ile başlıyor). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function readBlock(rawCss: string, selector: string): Record<string, string> {
  const css = stripComments(rawCss);
  /*
   * Seçici tek başına da olabilir (`X {`) virgüllü bir listenin parçası da (`X,\n Y {`) —
   * koyu auth yüzeyi K6'dan sonra iki biçimde işaretleniyor. Blok, seçiciden sonraki ilk
   * süslü parantezle başlar.
   */
  const selectorIndex = css.indexOf(selector);
  assert.notEqual(selectorIndex, -1, `\`${selector}\` bloğu globals.css içinde yok.`);

  const blockStart = css.indexOf("{", selectorIndex);
  const blockEnd = css.indexOf("}", blockStart);
  assert.notEqual(blockEnd, -1, `\`${selector}\` bloğu kapanmamış.`);

  const body = css.slice(blockStart + 1, blockEnd);
  const declarations: Record<string, string> = {};

  for (const line of body.split(";")) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*(.+?)\s*$/i.exec(line);

    if (match?.[1] && match[2]) {
      declarations[match[1]] = match[2];
    }
  }

  return declarations;
}

function hslToRgb(value: string): Rgb {
  const [rawHue, rawSaturation, rawLightness] = value.trim().split(/\s+/);
  const hue = ((((Number.parseFloat(rawHue ?? "0") % 360) + 360) % 360) / 360) as number;
  const saturation = Number.parseFloat(rawSaturation ?? "0") / 100;
  const lightness = Number.parseFloat(rawLightness ?? "0") / 100;

  if (saturation === 0) {
    return { blue: lightness, green: lightness, red: lightness };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const channel = (offset: number) => {
    const t = (((hue + offset) % 1) + 1) % 1;

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

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const linear = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = ({ blue, green, red }: Rgb) =>
    0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);

  const first = luminance(foreground);
  const second = luminance(background);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("auth surface tokens", () => {
  it("defines every SPEC §1.1 token on the auth surface", () => {
    const declarations = readBlock(readGlobalsCss(), "[data-auth-surface]");

    for (const [token, expected] of Object.entries(LIGHT_TOKENS)) {
      assert.equal(declarations[token], expected, `${token} açık temada SPEC değerinde değil.`);
    }

    assert.equal(declarations["color-scheme"], undefined);
  });

  it("defines every SPEC §1.2 token on the dark auth surface", () => {
    const declarations = readBlock(readGlobalsCss(), '[data-auth-surface][data-auth-theme="dark"]');

    for (const [token, expected] of Object.entries(DARK_TOKENS)) {
      assert.equal(declarations[token], expected, `${token} koyu temada SPEC değerinde değil.`);
    }
  });

  it("sets an explicit color-scheme on both auth surfaces", () => {
    const css = readGlobalsCss();

    assert.match(css, /\[data-auth-surface\] \{[^}]*color-scheme: light;/s);
    assert.match(
      css,
      /\[data-auth-surface\]\[data-auth-theme="dark"\],[\s\S]*?\{[^}]*color-scheme: dark;/,
    );
  });

  it("keeps --surface-inset scoped to the auth surface (K5)", () => {
    const css = readGlobalsCss();
    const definitions = css.match(/--surface-inset\s*:/g) ?? [];

    // Yalnız iki tanım: açık ve koyu auth bloğu. Global temalara sızmamalı.
    assert.equal(definitions.length, 2);
  });

  it("leaves the global -soft contrast invariant untouched (K5)", () => {
    const rootBlock = readBlock(readGlobalsCss(), ":root");

    assert.equal(rootBlock["--danger-soft"], "352 70% 16%");
    assert.equal(rootBlock["--success-soft"], "154 46% 16%");
    assert.equal(rootBlock["--warning-soft"], "34 55% 17%");
  });

  it("carries the SPEC §5 desktop titlebar height (K7)", () => {
    const rootBlock = readBlock(readGlobalsCss(), ":root");

    assert.equal(rootBlock["--desktop-titlebar-height"], "38px");
  });

  it("keeps every -soft status text above AA on its own card (SPEC §12/6)", () => {
    for (const [label, tokens] of [
      ["light", LIGHT_TOKENS],
      ["dark", DARK_TOKENS],
    ] as const) {
      const card = hslToRgb(tokens["--surface-card"] ?? "");
      const inset = hslToRgb(tokens["--surface-inset"] ?? "");

      for (const soft of ["--danger-soft", "--success-soft", "--warning-soft"] as const) {
        const text = hslToRgb(tokens[soft] ?? "");

        for (const [surfaceName, surface] of [
          ["--surface-card", card],
          ["--surface-inset", inset],
        ] as const) {
          const ratio = contrastRatio(text, surface);

          assert.ok(
            ratio >= WCAG_AA_CONTRAST,
            `${label} ${soft} üstünde ${surfaceName}: ${ratio.toFixed(2)}:1 (< ${WCAG_AA_CONTRAST}).`,
          );
        }
      }
    }
  });
});
