import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getMobileTheme,
  MOBILE_THEME_PREFERENCE_KEY,
  normalizeMobileThemeMode,
  resolveMobileTheme,
} from "../src/design/mobile-theme-runtime";
import { darkTheme, lightTheme, type MobileTheme } from "../src/design/themes";

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

interface RgbaColor {
  readonly alpha: number;
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

function parseColor(color: string): RgbaColor {
  const hexMatch = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (hexMatch) {
    const [, red, green, blue] = hexMatch;
    assert.ok(red && green && blue, `Expected RGB channels, received ${color}`);
    return {
      alpha: 1,
      blue: Number.parseInt(blue, 16),
      green: Number.parseInt(green, 16),
      red: Number.parseInt(red, 16),
    };
  }

  const rgbaMatch =
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?(?:\.\d+)?|1(?:\.0+)?)\s*\)$/i.exec(
      color,
    );
  assert.ok(rgbaMatch, `Expected hex or rgba color, received ${color}`);
  const [, red, green, blue, alpha] = rgbaMatch;
  assert.ok(red && green && blue && alpha, `Expected RGBA channels, received ${color}`);
  const parsed = {
    alpha: Number.parseFloat(alpha),
    blue: Number.parseInt(blue, 10),
    green: Number.parseInt(green, 10),
    red: Number.parseInt(red, 10),
  };
  assert.ok(
    [parsed.red, parsed.green, parsed.blue].every((channel) => channel >= 0 && channel <= 255),
    `Expected 0-255 RGB channels, received ${color}`,
  );
  return parsed;
}

function composite(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  assert.equal(background.alpha, 1, "Contrast backdrops must be opaque");
  return {
    alpha: 1,
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
  };
}

function relativeLuminance(color: RgbaColor): number {
  assert.equal(color.alpha, 1, "Relative luminance requires an opaque color");
  return (
    0.2126 * linearize(color.red) + 0.7152 * linearize(color.green) + 0.0722 * linearize(color.blue)
  );
}

function contrastRatio(foreground: string, background: string, backdrop?: string): number {
  const parsedForeground = parseColor(foreground);
  assert.equal(parsedForeground.alpha, 1, "Text and control foregrounds must be opaque");
  const parsedBackground = parseColor(background);
  const opaqueBackground =
    parsedBackground.alpha === 1
      ? parsedBackground
      : composite(parsedBackground, parseColor(backdrop ?? "#FFFFFF"));
  const foregroundLuminance = relativeLuminance(parsedForeground);
  const backgroundLuminance = relativeLuminance(opaqueBackground);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function keyShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return typeof value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, keyShape(child)]),
  );
}

function assertRecursivelyFrozen(value: unknown, path = "theme"): void {
  if (!value || typeof value !== "object") {
    return;
  }

  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assertRecursivelyFrozen(child, `${path}.${key}`);
  }
}

function assertThemeContrast(theme: MobileTheme): void {
  for (const surfaceName of ["base", "card", "elevated", "rail", "soft"] as const) {
    assert.ok(
      contrastRatio(theme.text.primary, theme.surface[surfaceName]) >= 4.5,
      `${theme.id} text.primary on surface.${surfaceName}`,
    );
  }

  for (const textRole of ["muted", "placeholder", "secondary", "soft"] as const) {
    for (const surfaceName of ["base", "card"] as const) {
      assert.ok(
        contrastRatio(theme.text[textRole], theme.surface[surfaceName]) >= 4.5,
        `${theme.id} text.${textRole} on surface.${surfaceName}`,
      );
    }
  }

  assert.ok(
    contrastRatio(theme.text.onPrimary, theme.accent.action) >= 4.5,
    `${theme.id} text.onPrimary on accent.action`,
  );
  assert.ok(
    contrastRatio(theme.text.onInverse, theme.surface.inverse) >= 4.5,
    `${theme.id} text.onInverse on surface.inverse`,
  );
  for (const surfaceName of ["base", "card"] as const) {
    assert.ok(
      contrastRatio(theme.accent.strong, theme.surface[surfaceName]) >= 4.5,
      `${theme.id} accent.strong on surface.${surfaceName}`,
    );
  }
  assert.ok(
    contrastRatio(theme.border.focus, theme.surface.card) >= 3,
    `${theme.id} border.focus on surface.card`,
  );
  assert.ok(
    contrastRatio(theme.text.onPrimary, theme.status.dangerAction) >= 4.5,
    `${theme.id} text.onPrimary on status.dangerAction`,
  );

  for (const surfaceName of ["base", "card"] as const) {
    assert.ok(
      contrastRatio(theme.status.dangerOnBase, theme.surface[surfaceName]) >= 4.5,
      `${theme.id} status.dangerOnBase on surface.${surfaceName}`,
    );
  }
  assert.ok(
    contrastRatio(theme.status.danger, theme.surface.card) >= 4.5,
    `${theme.id} status.danger on surface.card`,
  );

  for (const surfaceName of ["base", "card"] as const) {
    assert.ok(
      contrastRatio(theme.status.danger, theme.status.dangerSoft, theme.surface[surfaceName]) >= 3,
      `${theme.id} status.danger accent on status.dangerSoft over surface.${surfaceName}`,
    );
    assert.ok(
      contrastRatio(theme.status.successText, theme.surface[surfaceName]) >= 4.5,
      `${theme.id} status.successText on surface.${surfaceName}`,
    );
    assert.ok(
      contrastRatio(theme.status.info, theme.surface[surfaceName]) >= 4.5,
      `${theme.id} status.info on surface.${surfaceName}`,
    );
    assert.ok(
      contrastRatio(theme.status.warning, theme.surface[surfaceName]) >= 4.5,
      `${theme.id} status.warning on surface.${surfaceName}`,
    );

    for (const statusSurface of ["dangerSoft", "infoSoft", "successSoft", "warningSoft"] as const) {
      assert.ok(
        contrastRatio(
          theme.status.onStatus,
          theme.status[statusSurface],
          theme.surface[surfaceName],
        ) >= 4.5,
        `${theme.id} status.onStatus on status.${statusSurface} over surface.${surfaceName}`,
      );
    }

    assert.ok(
      contrastRatio(
        theme.status.successText,
        theme.status.successSoft,
        theme.surface[surfaceName],
      ) >= 4.5,
      `${theme.id} status.successText on status.successSoft over surface.${surfaceName}`,
    );
  }

  assert.ok(
    contrastRatio(theme.media.text, theme.media.surface) >= 4.5,
    `${theme.id} media.text on media.surface`,
  );
}

describe("mobile semantic theme contract", () => {
  it("keeps light and dark semantic keys identical and recursively frozen", () => {
    assert.deepEqual(keyShape(darkTheme), keyShape(lightTheme));
    assertRecursivelyFrozen(lightTheme, "lightTheme");
    assertRecursivelyFrozen(darkTheme, "darkTheme");
  });

  it("meets required WCAG contrast ratios in both themes", () => {
    assertThemeContrast(lightTheme);
    assertThemeContrast(darkTheme);
  });

  it("uses a derived dark palette and surface elevation instead of inversion shadows", () => {
    assert.notEqual(darkTheme.surface.base, lightTheme.text.primary);
    assert.notEqual(darkTheme.accent.default, lightTheme.accent.default);
    assert.notEqual(darkTheme.surface.base, darkTheme.surface.card);
    assert.equal(darkTheme.elevation.card.shadowOpacity, 0);
    assert.equal(darkTheme.elevation.floating.shadowOpacity, 0);
  });

  it("normalizes and resolves system, light, and dark preferences fail-closed", () => {
    assert.equal(MOBILE_THEME_PREFERENCE_KEY, "whispr.mobile.theme-preference");
    assert.equal(normalizeMobileThemeMode("system"), "system");
    assert.equal(normalizeMobileThemeMode("light"), "light");
    assert.equal(normalizeMobileThemeMode("dark"), "dark");
    assert.equal(normalizeMobileThemeMode("unknown"), "system");
    assert.equal(normalizeMobileThemeMode(null), "system");

    assert.equal(resolveMobileTheme("system", "dark"), "dark");
    assert.equal(resolveMobileTheme("system", "light"), "light");
    assert.equal(resolveMobileTheme("system", "unspecified"), "light");
    assert.equal(resolveMobileTheme("system", null), "light");
    assert.equal(resolveMobileTheme("dark", "light"), "dark");
    assert.equal(resolveMobileTheme("light", "dark"), "light");
    assert.equal(getMobileTheme("system", "dark"), darkTheme);
    assert.equal(getMobileTheme("system", "light"), lightTheme);
  });
});
