import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DISCOVER_THEME_CONTRAST } from "./discover-responsive";

const directory = dirname(fileURLToPath(import.meta.url));

function productionSources(root = directory): readonly [string, string][] {
  return readdirSync(root)
    .sort()
    .flatMap((name) => {
      const path = join(root, name);
      if (statSync(path).isDirectory()) {
        return productionSources(path);
      }
      if (
        (!name.endsWith(".ts") && !name.endsWith(".tsx")) ||
        name.endsWith(".test.ts") ||
        name.endsWith(".test.tsx")
      ) {
        return [];
      }
      return [[path.slice(directory.length + 1), readFileSync(path, "utf8")] as const];
    });
}

function hslToRgb([hue, saturationPercent, lightnessPercent]: readonly [number, number, number]) {
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const segment = Math.floor(hue / 60) % 6;
  const segments = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ] as const;
  const [red, green, blue] = segments[segment] ?? [0, 0, 0];
  return [red + offset, green + offset, blue + offset] as const;
}

function luminance(rgb: readonly number[]) {
  const channels = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(
  foreground: readonly [number, number, number],
  background: readonly [number, number, number],
) {
  const foregroundLuminance = luminance(hslToRgb(foreground));
  const backgroundLuminance = luminance(hslToRgb(background));
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

describe("Keşfet stil sözleşmesi", () => {
  it("components/discover üretim kaynaklarında arbitrary px sınıfı sıfırdır", () => {
    const offenders = productionSources().flatMap(([name, source]) =>
      /\[[^\]]*\d+(?:\.\d+)?px[^\]]*\]/u.test(source) ? [name] : [],
    );

    assert.deepEqual(offenders, []);
  });

  it("üretim kaynaklarında CSS zoom mekanizması yoktur", () => {
    const offenders = productionSources().flatMap(([name, source]) =>
      /\bzoom\s*[:=]/u.test(source) ? [name] : [],
    );

    assert.deepEqual(offenders, []);
  });

  it("outline bastırılan her satır token focus halkası taşır", () => {
    const offenders = productionSources().flatMap(([name, source]) =>
      source
        .split(/\r?\n/u)
        .flatMap((line, index) =>
          /outline-(?:hidden|none)/u.test(line) && !/ring-\[hsl\(var\(--ring\)\)\]/u.test(line)
            ? [`${name}:${index + 1}`]
            : [],
        ),
    );

    assert.deepEqual(offenders, []);
  });

  it("10.5px text-muted etiketleri iki temada tüm Keşfet yüzeylerinde AA geçirir", () => {
    for (const [theme, palette] of Object.entries(DISCOVER_THEME_CONTRAST)) {
      for (const [surface, background] of Object.entries(palette.backgrounds)) {
        const ratio = contrast(palette.textMuted, background);
        assert.ok(ratio >= 4.5, `${theme}/${surface}: ${ratio.toFixed(3)}:1`);
      }
    }
  });
});
