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

function relativeLuminance(color: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  assert.ok(match, `Expected opaque hex color, received ${color}`);
  const red = match[1];
  const green = match[2];
  const blue = match[3];
  assert.ok(red && green && blue, `Expected RGB channels, received ${color}`);

  return (
    0.2126 * linearize(Number.parseInt(red, 16)) +
    0.7152 * linearize(Number.parseInt(green, 16)) +
    0.0722 * linearize(Number.parseInt(blue, 16))
  );
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
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
  for (const [surfaceName, surfaceColor] of Object.entries(theme.surface)) {
    assert.ok(
      contrastRatio(theme.text.primary, surfaceColor) >= 4.5,
      `${theme.id} text.primary on surface.${surfaceName}`,
    );
  }

  assert.ok(
    contrastRatio(theme.text.muted, theme.surface.base) >= 4.5,
    `${theme.id} text.muted on surface.base`,
  );
  assert.ok(
    contrastRatio(theme.text.onPrimary, theme.accent.default) >= 4.5,
    `${theme.id} text.onPrimary on accent.default`,
  );
  assert.ok(
    contrastRatio(theme.border.default, theme.surface.card) >= 3,
    `${theme.id} border.default on surface.card`,
  );
  assert.ok(
    contrastRatio(theme.status.danger, theme.status.dangerSoft) >= 4.5,
    `${theme.id} status.danger on status.dangerSoft`,
  );
  assert.ok(
    contrastRatio(theme.status.info, theme.status.infoSoft) >= 4.5,
    `${theme.id} status.info on status.infoSoft`,
  );
  assert.ok(
    contrastRatio(theme.status.success, theme.status.successSoft) >= 4.5,
    `${theme.id} status.success on status.successSoft`,
  );
  assert.ok(
    contrastRatio(theme.status.warning, theme.status.warningSoft) >= 4.5,
    `${theme.id} status.warning on status.warningSoft`,
  );
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
