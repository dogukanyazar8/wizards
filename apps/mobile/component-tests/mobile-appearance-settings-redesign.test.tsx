import { describe, expect, it } from "@jest/globals";
import {
  MOBILE_ACCENT_OPTIONS,
  MOBILE_ACCENT_PREFERENCE_KEY,
  MOBILE_FONT_SCALE_PREFERENCE_KEY,
  MOBILE_FONT_SCALE_STEPS,
  MOBILE_VOICE_APPEARANCE_OPTIONS,
  composeMobileTheme,
  getMobileAccentColor,
  getMobileFontScaleSliderProgress,
  getMobileFontScaleStepForSliderProgress,
  getMobileThemeFontScale,
  getMobileThemeStyleSource,
  normalizeMobileAccentId,
  normalizeMobileFontScaleStep,
  scaleMobileStyleSheetText,
} from "../src/design/mobile-appearance-preferences";
import { darkTheme, lightTheme } from "../src/design/themes";

describe("4c appearance preferences", () => {
  it("keeps the default accent and scale bit-identical to the base theme", () => {
    expect(composeMobileTheme(lightTheme, "indigo", 2)).toBe(lightTheme);
    expect(composeMobileTheme(darkTheme, "indigo", 2)).toBe(darkTheme);
  });

  it("exposes the six handoff swatches in order", () => {
    expect(MOBILE_ACCENT_OPTIONS.map((option) => option.color)).toEqual([
      "#4F46E5",
      "#8B5CF6",
      "#3B82F6",
      "#22A366",
      "#E0527E",
      "#C77A2B",
    ]);
  });

  it("applies a non-default accent to action, focus and gradient tokens", () => {
    const violet = composeMobileTheme(lightTheme, "violet", 2);

    expect(violet.accent.default).toBe("#8B5CF6");
    expect(violet.accent.action).toBe("#8B5CF6");
    expect(violet.border.focus).toBe("#8B5CF6");
    expect(violet.gradients.primaryAction[0]).toBe("#8B5CF6");
    expect(violet.elevation.primaryAction.shadowColor).toBe("#8B5CF6");
    expect(violet.accent.soft).not.toBe(lightTheme.accent.soft);
  });

  it("uses the selected swatch as the strong accent in dark themes", () => {
    const violet = composeMobileTheme(darkTheme, "violet", 2);

    expect(violet.accent.strong).toBe("#8B5CF6");
  });

  it("scales typography sizes by the selected step without touching tracking", () => {
    const scaled = composeMobileTheme(lightTheme, "indigo", 4);
    const factor = MOBILE_FONT_SCALE_STEPS[4];

    expect(scaled.typography.body.fontSize).toBeCloseTo(
      lightTheme.typography.body.fontSize * factor,
      5,
    );
    expect(scaled.typography.body.lineHeight).toBeCloseTo(
      lightTheme.typography.body.lineHeight * factor,
      5,
    );
    expect(scaled.typography.overline.letterSpacing).toBe(
      lightTheme.typography.overline.letterSpacing,
    );
    expect(scaled.accent.default).toBe(lightTheme.accent.default);
  });

  it("lists the voice-room columns in the theme picker's order", () => {
    expect(MOBILE_VOICE_APPEARANCE_OPTIONS).toEqual(["light", "dark", "system"]);
  });

  /**
   * The interface scale used to reach `theme.typography` and stop there, which
   * meant it moved barely a tenth of the app's text: everything else writes its
   * size as a literal in a style factory. The scale now rides on the finished
   * style sheet, and these three exports are what carries it there.
   */
  it("carries the interface scale to the style sheet instead of the tokens alone", () => {
    const scaled = composeMobileTheme(lightTheme, "indigo", 4);
    const factor = MOBILE_FONT_SCALE_STEPS[4];

    expect(getMobileThemeFontScale(scaled)).toBe(factor);
    expect(getMobileThemeFontScale(lightTheme)).toBe(1);

    const sheet = scaleMobileStyleSheetText(
      {
        badge: { borderRadius: 8, fontSize: 11, height: 16 },
        body: { fontSize: 15, lineHeight: 21 },
        divider: { height: 1 },
      },
      getMobileThemeFontScale(scaled),
    );

    expect(sheet.body).toEqual({ fontSize: 15 * factor, lineHeight: 21 * factor });
    // Box measurements hold: the type grows inside the existing layout.
    expect(sheet.badge).toEqual({ borderRadius: 8, fontSize: 11 * factor, height: 16 });
    expect(sheet.divider).toEqual({ height: 1 });
  });

  /**
   * The guard against applying the factor twice: a style built by spreading a
   * typography token must reach the sheet at 1x, because the sheet is what gets
   * scaled.
   */
  it("hands style factories unscaled typography", () => {
    const scaled = composeMobileTheme(lightTheme, "indigo", 4);
    const source = getMobileThemeStyleSource(scaled);

    expect(source.typography.body.fontSize).toBe(lightTheme.typography.body.fontSize);
    expect(source.accent.default).toBe(scaled.accent.default);
    expect(getMobileThemeStyleSource(lightTheme)).toBe(lightTheme);
  });

  it("places the handoff default text scale at its 45 percent track marker", () => {
    expect(getMobileFontScaleSliderProgress(0)).toBe(0);
    expect(getMobileFontScaleSliderProgress(2)).toBe(0.45);
    expect(getMobileFontScaleSliderProgress(4)).toBe(1);
    expect(getMobileFontScaleStepForSliderProgress(0.45)).toBe(2);
    expect(getMobileFontScaleStepForSliderProgress(0.6)).toBe(3);
  });

  it("memoizes composed themes per base, accent and step", () => {
    const lightGreen = composeMobileTheme(lightTheme, "green", 3);

    expect(lightGreen).toBe(composeMobileTheme(lightTheme, "green", 3));
    expect(lightGreen).not.toBe(composeMobileTheme(darkTheme, "green", 3));
    expect(Object.isFrozen(lightGreen)).toBe(true);
    expect(Object.isFrozen(lightGreen.typography.body)).toBe(true);
  });

  it("fails closed to defaults on unknown stored values", () => {
    expect(normalizeMobileAccentId("sepia")).toBe("indigo");
    expect(normalizeMobileAccentId(null)).toBe("indigo");
    expect(normalizeMobileFontScaleStep("9")).toBe(2);
    expect(normalizeMobileFontScaleStep("3")).toBe(3);
    expect(normalizeMobileFontScaleStep(undefined)).toBe(2);
    expect(getMobileAccentColor("pink")).toBe("#E0527E");
  });

  it("stores preferences under stable whispr keys", () => {
    expect(MOBILE_ACCENT_PREFERENCE_KEY).toBe("whispr.mobile.accent-preference");
    expect(MOBILE_FONT_SCALE_PREFERENCE_KEY).toBe("whispr.mobile.font-scale-preference");
  });
});
