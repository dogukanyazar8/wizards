import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import * as ts from "typescript";

import * as paletteModule from "../src/design/palette";
import { getMobileThemeCompatibilityColors } from "../src/design/mobile-theme-compat";
import { darkTheme, lightTheme } from "../src/design/themes";
import {
  mobileLayoutMetrics,
  mobileNavigationMetrics,
  mobileRadii,
  mobileSizing,
  mobileSpacing,
  mobileTypography,
} from "../src/design/tokens";

const paletteExports = paletteModule as Record<string, unknown>;
type DynamicTypeViolation = {
  file: string;
  line: number;
  reason: "below-minimum" | "missing-value" | "non-literal";
  value?: number;
};

function collectTypeScriptSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(root, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptSources(absolutePath);
    }

    return /\.tsx?$/.test(entry.name) ? [absolutePath] : [];
  });
}

function readNumericLiteral(expression: ts.Expression): number | null {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return readNumericLiteral(expression.expression);
  }

  if (ts.isPrefixUnaryExpression(expression)) {
    const operand = readNumericLiteral(expression.operand);
    if (operand === null) {
      return null;
    }

    if (expression.operator === ts.SyntaxKind.PlusToken) {
      return operand;
    }
    if (expression.operator === ts.SyntaxKind.MinusToken) {
      return -operand;
    }

    return null;
  }

  if (!ts.isNumericLiteral(expression)) {
    return null;
  }

  const value = Number(expression.text);
  return Number.isFinite(value) ? value : null;
}

function findDynamicTypeViolationsInSource(file: string, source: string): DynamicTypeViolation[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: DynamicTypeViolation[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "maxFontSizeMultiplier"
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const initializer = node.initializer;

      if (!initializer) {
        violations.push({ file, line, reason: "missing-value" });
      } else if (!ts.isJsxExpression(initializer) || !initializer.expression) {
        violations.push({ file, line, reason: "non-literal" });
      } else {
        const value = readNumericLiteral(initializer.expression);

        if (value === null) {
          violations.push({ file, line, reason: "non-literal" });
        } else if (value < 2) {
          violations.push({ file, line, reason: "below-minimum", value });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

describe("mobile redesign palette contract", () => {
  it("locks the redesign radius, sizing, and spacing scale", () => {
    assert.deepEqual(mobileRadii, {
      card: 22,
      cardLarge: 24,
      row: 16,
      control: 14,
      chip: 16,
      bubble: 18,
      sheet: 36,
      tabBar: 26,
      tabPill: 18,
      pill: 999,
    });
    assert.deepEqual(mobileSizing, {
      maxInlineContentWidth: 520,
      minTouchTarget: 44,
      presenceDot: 14,
      presenceDotBorder: 2.5,
      unreadBadgeMinHeight: 20,
      avatarS: 36,
      avatarSRadius: 12,
      avatarM: 40,
      avatarMRadius: 14,
      avatarL: 44,
      avatarLRadius: 16,
      avatarXL: 50,
      avatarXLRadius: 18,
      avatarXXL: 76,
      avatarXXLRadius: 26,
      squircle38: 38,
      squircle38Radius: 13,
      squircle46: 46,
      squircle46Radius: 16,
      squircle52: 52,
      squircle52Radius: 18,
      squircle60: 60,
      squircle60Radius: 22,
      squircle80: 80,
      squircle80Radius: 28,
      iconStroke: 1.8,
    });
    assert.deepEqual(mobileSpacing, {
      page: 20,
      pageWide: 24,
      section: 16,
      row: 12,
    });
    assert.deepEqual(mobileNavigationMetrics, {
      miniVoiceBarToTabBarGap: 14,
      tabBarPaddingBottom: 15,
      tabBarPaddingHorizontal: 8,
      tabBarPaddingTop: 8,
      tabItemGap: 2,
      tabItemPaddingVertical: 5,
    });
    assert.deepEqual(mobileLayoutMetrics.auth, {
      backButton: 42,
      backButtonRadius: 15,
      backgroundDot: 4,
      backgroundDotCount: 24,
      backgroundDotHighlightedOpacity: 0.5,
      backgroundDotHighlightInterval: 3,
      backgroundDotHorizontalModulo: 96,
      backgroundDotHorizontalStep: 17,
      backgroundDotOpacity: 0.28,
      backgroundDotVerticalModulo: 92,
      backgroundDotVerticalStep: 29,
      backgroundGlowBottomDiameter: 240,
      backgroundGlowBottomOffsetBottom: 104,
      backgroundGlowBottomOffsetLeft: 84,
      backgroundGlowTopDiameter: 220,
      backgroundGlowTopOffsetRight: 86,
      backgroundGlowTopOffsetTop: 92,
      checkboxCheckGlyph: 14,
      compactRegisterPasswordIcon: 16,
      ctaContentGap: 10,
      ctaHeight: 56,
      ctaRadius: 28,
      formPrimaryActionIcon: 17,
      formCtaHeight: 54,
      formCtaRadius: 27,
      featureChipRadius: 18,
      featureDot: 7,
      fieldRadius: 16,
      forgotActionGap: 6,
      forgotContentGap: 18,
      forgotContentPaddingBottom: 60,
      forgotContentPaddingHorizontal: 24,
      forgotIconCardGlyph: 32,
      forgotInfoBannerMarginTop: 6,
      fullInputIcon: 18,
      focusRingRadius: 3,
      formInputPaddingVertical: 14,
      heroGap: 22,
      heroPadding: 30,
      iconCard: 72,
      iconCardRadius: 26,
      inputPaddingVertical: 13,
      infoBannerGlyph: 16,
      labelGap: 7,
      loginSocialActionHeight: 48,
      loginSocialActionGap: 10,
      loginSocialActionWidth: 78,
      loginRememberMeWidth: 112,
      logoSquircle: 56,
      logoSquircleRadius: 18,
      profileIcon: 30,
      profileCheckGlyph: 9,
      profileGlyph: 15,
      profilePreviewOffsetRight: 8,
      profilePreviewOffsetTop: 7,
      profileRadius: 18,
      profileSelectionBadgeBottomOffset: 7,
      profileSelectionBadge: 16,
      profileSelectionBadgeRightOffset: 10,
      profileSelectionBorderWidth: 1.5,
      passwordHintShieldIcon: 14,
      registerContentGap: 13,
      registerPasswordColumnGap: 10,
      registerPasswordColumnMinWidth: 132,
      securityBadgeIcon: 18,
      securityShieldIcon: 21,
      termsCheckbox: 18,
      themePillRadius: 20,
      topBarBackIcon: 18,
      topBarLogo: 32,
      topBarLogoRadius: 11,
      welcomeBrandCardSize: 52,
      welcomeBrandGap: 13,
      welcomeBackgroundDotRadius: 1.2,
      welcomeBackgroundDotSpacing: 26,
      welcomeBackgroundReferenceHeight: 844,
      welcomeBackgroundReferenceWidth: 390,
      welcomeCopyrightTopPadding: 6,
      welcomeCtaBottomPadding: 26,
      welcomeFeatureChipGap: 8,
      welcomeFeatureChipContentGap: 7,
      welcomeFeatureChipHorizontalPadding: 13,
      welcomeFeatureChipVerticalPadding: 8,
      welcomeLanguageChevronIcon: 12,
      welcomeLanguageControlGap: 6,
      welcomeLanguageControlHeight: 35,
      welcomeLanguageIcon: 14,
      welcomeLanguagePaddingHorizontal: 13,
      welcomeLanguagePaddingVertical: 5,
      welcomePrimaryActionIcon: 18,
      welcomeSecondaryActionIcon: 18,
      welcomeThemeControlGap: 5,
      welcomeThemeIcon: 13,
      welcomeThemePillGap: 2,
      welcomeThemePillPadding: 4,
      welcomeThemeSegmentHorizontalPadding: 11,
      welcomeThemeSegmentVerticalPadding: 5,
      welcomeTopControlsGap: 8,
      welcomeTopControlsPaddingTop: 2,
      languageSheet: {
        badge: 38,
        badgeRadius: 13,
        close: 36,
        closeRadius: 13,
        contentHorizontalPadding: 20,
        contentPaddingBottom: 30,
        deviceRadius: 16,
        handleHeight: 5,
        handleRadius: 3,
        handleWidth: 40,
        panelRadius: 28,
        rowRadius: 18,
        rowPaddingHorizontal: 15,
        rowPaddingVertical: 13,
        toggleHeight: 26,
        toggleThumb: 20,
        toggleWidth: 44,
      },
    });
  });

  it("locks every redesign typography role to explicit Plus Jakarta metrics", () => {
    assert.deepEqual(mobileTypography, {
      fontFamily: "WhisprJakarta_400Regular",
      fontFamilyMedium: "WhisprJakarta_500Medium",
      fontFamilySemiBold: "WhisprJakarta_600SemiBold",
      fontFamilyBold: "WhisprJakarta_700Bold",
      fontFamilyExtraBold: "WhisprJakarta_800ExtraBold",
      authEyebrow: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 1.98,
      },
      authHeroTitle: {
        fontFamily: "WhisprJakarta_800ExtraBold",
        fontSize: 40,
        lineHeight: 44.8,
        letterSpacing: -1.2,
      },
      authHeroBody: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 16,
        lineHeight: 24.8,
        letterSpacing: 0,
      },
      authTitle: {
        fontFamily: "WhisprJakarta_800ExtraBold",
        fontSize: 29,
        lineHeight: 36,
        letterSpacing: -0.58,
      },
      authSubtitle: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 13.5,
        lineHeight: 19,
        letterSpacing: 0,
      },
      authFieldLabel: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 13,
        lineHeight: 18,
        letterSpacing: 0,
      },
      authInput: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 14.5,
        lineHeight: 20,
        letterSpacing: 0,
      },
      authCta: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 16,
        lineHeight: 22,
        letterSpacing: 0,
      },
      authWelcomeCta: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 16.5,
        lineHeight: 22,
        letterSpacing: 0,
      },
      authResetCta: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 15.5,
        lineHeight: 22,
        letterSpacing: 0,
      },
      authResetAction: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 13.5,
        lineHeight: 20,
        letterSpacing: 0,
      },
      authCompactInput: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 13.5,
        lineHeight: 20,
        letterSpacing: 0,
      },
      authLegalCopy: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 12.5,
        lineHeight: 18.75,
        letterSpacing: 0,
      },
      authResetSubtitle: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 13.5,
        lineHeight: 20.925,
        letterSpacing: 0,
      },
      authWelcomeBrand: {
        fontFamily: "WhisprJakarta_800ExtraBold",
        fontSize: 30,
        lineHeight: 36,
        letterSpacing: -0.6,
      },
      authWelcomeControl: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0,
      },
      authWelcomeControlMuted: {
        fontFamily: "WhisprJakarta_600SemiBold",
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0,
      },
      authWelcomeCopyright: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0,
      },
      authWelcomeFeature: {
        fontFamily: "WhisprJakarta_600SemiBold",
        fontSize: 12.5,
        lineHeight: 15,
        letterSpacing: 0,
      },
      authLanguageSheetTitle: {
        fontFamily: "WhisprJakarta_800ExtraBold",
        fontSize: 19,
        lineHeight: 24,
        letterSpacing: 0,
      },
      authLanguageSheetSubtitle: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 12.5,
        lineHeight: 17,
        letterSpacing: 0,
      },
      authLanguageOption: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 15,
        lineHeight: 20,
        letterSpacing: 0,
      },
      authLanguageOptionSecondary: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0,
      },
      display: {
        fontFamily: "WhisprJakarta_800ExtraBold",
        fontSize: 26,
        lineHeight: 32,
        letterSpacing: -0.52,
      },
      headline: {
        fontFamily: "WhisprJakarta_800ExtraBold",
        fontSize: 19,
        lineHeight: 24,
        letterSpacing: 0,
      },
      title: {
        fontFamily: "WhisprJakarta_800ExtraBold",
        fontSize: 17,
        lineHeight: 22,
        letterSpacing: 0,
      },
      bodyStrong: {
        fontFamily: "WhisprJakarta_600SemiBold",
        fontSize: 15,
        lineHeight: 21,
        letterSpacing: 0,
      },
      body: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 15,
        lineHeight: 21,
        letterSpacing: 0,
      },
      message: {
        fontFamily: "WhisprJakarta_400Regular",
        fontSize: 14.5,
        lineHeight: 21,
        letterSpacing: 0,
      },
      secondary: {
        fontFamily: "WhisprJakarta_500Medium",
        fontSize: 12.5,
        lineHeight: 17,
        letterSpacing: 0,
      },
      caption: {
        fontFamily: "WhisprJakarta_600SemiBold",
        fontSize: 11.5,
        lineHeight: 15,
        letterSpacing: 0,
      },
      overline: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 11.5,
        lineHeight: 14,
        letterSpacing: 1.38,
      },
      dateSeparator: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 11,
        lineHeight: 14,
        letterSpacing: 1.1,
      },
      button: {
        fontFamily: "WhisprJakarta_700Bold",
        fontSize: 14,
        lineHeight: 18,
        letterSpacing: 0,
      },
      label: {
        fontFamily: "WhisprJakarta_600SemiBold",
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0,
      },
      tabLabel: {
        fontFamily: "WhisprJakarta_600SemiBold",
        fontSize: 10.5,
        lineHeight: 13,
        letterSpacing: 0,
      },
    });

    for (const [role, metrics] of Object.entries(mobileTypography)) {
      if (typeof metrics === "string") {
        continue;
      }

      assert.equal(typeof metrics.lineHeight, "number", `${role} lineHeight`);
      assert.equal(typeof metrics.letterSpacing, "number", `${role} letterSpacing`);
    }
  });

  it("parses Dynamic Type JSX expressions and fails closed on unknown values", () => {
    const fixture = `
const stringLookalike = "<Text maxFontSizeMultiplier={1.1} />";
// <Text maxFontSizeMultiplier={1.2} />
export function Fixture({ cap }: { cap: number }) {
  return (
    <>
      <Text maxFontSizeMultiplier={.5} />
      <Text maxFontSizeMultiplier={1e0} />
      <Text maxFontSizeMultiplier={(1.5)} />
      <Text maxFontSizeMultiplier={1.5 as const} />
      <Text maxFontSizeMultiplier={1.5 satisfies number} />
      <Text maxFontSizeMultiplier={+1.5} />
      <Text maxFontSizeMultiplier={-1} />
      <Text maxFontSizeMultiplier={cap} />
      <Text maxFontSizeMultiplier="1.5" />
      <Text maxFontSizeMultiplier />
      <Text maxFontSizeMultiplier={2} />
      <Text maxFontSizeMultiplier={2.5 as const} />
      <Text maxFontSizeMultiplier={+2} />
      <Text />
    </>
  );
}
`;

    const violations = findDynamicTypeViolationsInSource("fixture.tsx", fixture);

    assert.ok(violations.every(({ file }) => file === "fixture.tsx"));
    assert.deepEqual(
      violations.map(({ reason, value }) => ({ reason, value: value ?? null })),
      [
        { reason: "below-minimum", value: 0.5 },
        { reason: "below-minimum", value: 1 },
        { reason: "below-minimum", value: 1.5 },
        { reason: "below-minimum", value: 1.5 },
        { reason: "below-minimum", value: 1.5 },
        { reason: "below-minimum", value: 1.5 },
        { reason: "below-minimum", value: -1 },
        { reason: "non-literal", value: null },
        { reason: "non-literal", value: null },
        { reason: "missing-value", value: null },
      ],
    );
  });

  it("does not cap explicit numeric Dynamic Type multipliers below 2.0", () => {
    const sourceRoot = join(process.cwd(), "src");
    const violations = collectTypeScriptSources(sourceRoot).flatMap((file) =>
      findDynamicTypeViolationsInSource(
        relative(process.cwd(), file).replaceAll("\\", "/"),
        readFileSync(file, "utf8"),
      ),
    );

    assert.deepEqual(violations, []);
  });

  it("preserves every legacy mobilePalette group and key", () => {
    assert.deepEqual(Object.keys(paletteModule.mobilePalette), [
      "indigo",
      "neutral",
      "overlay",
      "status",
      "violet",
    ]);
    assert.deepEqual(Object.keys(paletteModule.mobilePalette.indigo), [
      "50",
      "100",
      "300",
      "400",
      "500",
      "600",
      "700",
      "900",
    ]);
    assert.deepEqual(Object.keys(paletteModule.mobilePalette.neutral), [
      "50",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "850",
      "900",
      "950",
      "white",
    ]);
    assert.deepEqual(Object.keys(paletteModule.mobilePalette.overlay), [
      "disabledDark",
      "disabledLight",
      "pressedDark",
      "pressedLight",
    ]);
    assert.deepEqual(Object.keys(paletteModule.mobilePalette.status), [
      "danger",
      "dangerDark",
      "dangerSoft",
      "dangerSoftDark",
      "info",
      "infoDark",
      "infoSoft",
      "infoSoftDark",
      "success",
      "successDark",
      "successSoft",
      "successSoftDark",
      "warning",
      "warningDark",
      "warningSoft",
      "warningSoftDark",
    ]);
    assert.deepEqual(Object.keys(paletteModule.mobilePalette.violet), [
      "50",
      "100",
      "300",
      "400",
      "500",
      "600",
      "700",
      "900",
    ]);
    assert.equal(paletteModule.mobilePalette.violet[600], "#7C3AED");
  });

  it("exports the canonical and accessible light and dark redesign mappings", () => {
    assert.deepEqual(paletteExports.redesignLight, {
      bg: "#F6F7FB",
      card: "#FFFFFF",
      border: "#E7E9F4",
      tabBarBorder: "#ECEEF6",
      hairline: "#F0F1F8",
      text: "#1E2235",
      canonicalTextSecondary: "#6B7194",
      textSecondary: "#62688B",
      canonicalTextFaint: "#8A90B0",
      textFaint: "#676D90",
      canonicalPlaceholder: "#9AA0BC",
      placeholder: "#676D90",
      primary: "#4F46E5",
      primaryStrong: "#3F38C9",
      focusRing: "rgba(79,70,229,.15)",
      noteFocusRing: "rgba(79,70,229,.12)",
      idleSurface: "#FDEBD7",
      idleText: "#C77A2B",
      languageBackdrop: "rgba(20,22,42,.38)",
      languageClose: "#F2F3FA",
      languageDevice: "#F5F6FC",
      languageHandle: "#DDE0F0",
      languageRadio: "#C9CDE4",
      lavender: "#EEF0FE",
      lavenderBorder: "#DFE2FC",
      ownerBadge: "#FFF3D6",
      success: "#22C55E",
      canonicalSuccessText: "#22A366",
      successSurface: "#E8F8EE",
      canonicalSuccessTextDeep: "#1B8A55",
      successText: "#187A4C",
      canonicalDanger: "#E05252",
      danger: "#C94343",
      dangerOnBase: "#C84343",
      dangerSurface: "#FCE9E9",
      pendingBadge: "#E0527E",
      controlChevron: "#B7BCD6",
      controlSeparatorDot: "#C6CADE",
      inkSurface: "#1E2235",
      voiceRoomControl: "#FFFFFF",
      voiceRoomVideo: "#F6F7FB",
      voiceRoomVideoGlass: "rgba(255,255,255,.72)",
      voiceRoomControlBorder: "#E7E9F4",
      voiceRoomInvite: "#FFFFFF",
      voiceRoomInviteBorder: "#E7E9F4",
      voiceRoomParticipant: "#FFFFFF",
    });
    assert.deepEqual(paletteExports.redesignDark, {
      bg: "#131529",
      card: "#1C1F3A",
      border: "#2B2F52",
      hairline: "#232644",
      text: "#ECEEFA",
      textSecondary: "#9BA1C7",
      canonicalTextFaint: "#6E7398",
      textFaint: "#8288AD",
      canonicalPrimary: "#6D66F0",
      primary: "#6D66F0",
      primaryWithWhiteText: "#6B63EC",
      focusRing: "rgba(109,102,240,.24)",
      noteFocusRing: "rgba(109,102,240,.20)",
      innerSurface: "#161936",
      idleSurface: "rgba(245,158,11,.14)",
      idleText: "#F59E0B",
      languageBackdrop: "rgba(0,0,0,.5)",
      languageClose: "#232644",
      languageDevice: "#232644",
      languageHandle: "#3B3F73",
      languageRadio: "#3B3F73",
      accentText: "#A5A8F5",
      selectedSurface: "#2A2D55",
      selectedBorder: "#3B3F73",
      ownerBadge: "#3A2E1B",
      canonicalDanger: "#E05252",
      danger: "#E45A5A",
      dangerAction: "#C94343",
      dangerOnBase: "#E45A5A",
      dangerSurface: "rgba(224,82,82,.14)",
      pendingBadge: "#E0527E",
      controlChevron: "#5B608C",
      controlSeparatorDot: "#3B3F73",
      success: "#34D399",
      successSurface: "rgba(52,211,153,.12)",
      warning: "#F59E0B",
      voiceRoom: "#1E2235",
      voiceRoomControl: "rgba(255,255,255,.1)",
      voiceRoomVideo: "#12141F",
      voiceRoomVideoGlass: "rgba(18,20,31,.6)",
      voiceRoomControlBorder: "transparent",
      voiceRoomInvite: "rgba(255,255,255,.04)",
      voiceRoomInviteBorder: "rgba(255,255,255,.15)",
      voiceRoomParticipant: "rgba(255,255,255,.05)",
      warningSurface: "rgba(245,158,11,.14)",
      sheetOverlay: "rgba(0,0,0,.55)",
    });
  });

  it("exports canonical auth palette primitives for light and dark surfaces", () => {
    assert.deepEqual(paletteExports.redesignAuthLight, {
      backgroundDot: "#4F46E5",
      backgroundGradientEnd: "#F7F3FB",
      backgroundGradientMiddle: "#EDEFFC",
      backgroundGradientStart: "#F5F2FC",
      backgroundGlowBlue: "#60A5FA",
      backgroundGlowLavender: "#A78BFA",
      gradientFrom: "#7C6CF6",
      gradientTo: "#4F46E5",
      gradientMutedFrom: "#6D5DF6",
      gradientMutedTo: "#4338CA",
      profileGamerFg: "#D6318C",
      profileGamerSoft: "#FCE7F1",
      profileGamerBorder: "#F5C8DF",
      profileCorporateFg: "#2373D6",
      profileCorporateSoft: "#E3F0FD",
      profileCorporateBorder: "#C4DEF7",
      featureEncryption: "#22A366",
      featureRealtime: "#8A46E5",
      featureCommunity: "#E0529C",
      featureFileShare: "#4F9CF6",
      featureVoice: "#E5A346",
    });
    assert.deepEqual(paletteExports.redesignAuthDark, {
      backgroundDot: "#A5A8F5",
      backgroundGradientEnd: "#151028",
      backgroundGradientMiddle: "#10182D",
      backgroundGradientStart: "#070B18",
      backgroundGlowBlue: "#3F6BFF",
      backgroundGlowLavender: "#6A4DFF",
      gradientFrom: "#7C6CF6",
      gradientTo: "#4F46E5",
      gradientMutedFrom: "#6D5DF6",
      gradientMutedTo: "#4338CA",
      profileGamerFg: "#D6318C",
      profileGamerSoft: "#1C1F3A",
      profileGamerBorder: "#2B2F52",
      profileCorporateFg: "#2373D6",
      profileCorporateSoft: "#1C1F3A",
      profileCorporateBorder: "#2B2F52",
      featureEncryption: "#22A366",
      featureRealtime: "#8A46E5",
      featureCommunity: "#E0529C",
      featureFileShare: "#4F9CF6",
      featureVoice: "#E5A346",
    });
  });

  it("maps auth gradients, profile accents, and feature accents into both themes", () => {
    assert.deepEqual(lightTheme.gradients.authPrimaryAction, ["#7C6CF6", "#4F46E5"]);
    assert.deepEqual(lightTheme.gradients.authPrimaryActionMuted, ["#6D5DF6", "#4338CA"]);
    assert.deepEqual(darkTheme.gradients.authPrimaryAction, ["#7C6CF6", "#4F46E5"]);
    assert.deepEqual(darkTheme.gradients.authPrimaryActionMuted, ["#6D5DF6", "#4338CA"]);

    const authFeatures = {
      community: "#E0529C",
      encryption: "#22A366",
      fileShare: "#4F9CF6",
      realtime: "#8A46E5",
      voice: "#E5A346",
    };
    assert.deepEqual(lightTheme.authFeature, authFeatures);
    assert.deepEqual(darkTheme.authFeature, authFeatures);

    assert.deepEqual(lightTheme.authProfile, {
      corporate: {
        badgeBorder: "#C4DEF7",
        badgeSoft: "#E3F0FD",
        badgeText: "#2373D6",
        icon: "#2373D6",
        iconSoft: "#E3F0FD",
      },
      gamer: {
        badgeBorder: "#F5C8DF",
        badgeSoft: "#FCE7F1",
        badgeText: "#D6318C",
        icon: "#D6318C",
        iconSoft: "#FCE7F1",
      },
      personal: {
        badgeBorder: "#DFE2FC",
        badgeSoft: "#EEF0FE",
        badgeText: "#3F38C9",
        icon: "#4F46E5",
        iconSoft: "#EEF0FE",
      },
    });
    assert.deepEqual(darkTheme.authProfile, {
      corporate: {
        badgeBorder: "#2B2F52",
        badgeSoft: "#1C1F3A",
        badgeText: "#2373D6",
        icon: "#2373D6",
        iconSoft: "#1C1F3A",
      },
      gamer: {
        badgeBorder: "#2B2F52",
        badgeSoft: "#1C1F3A",
        badgeText: "#D6318C",
        icon: "#D6318C",
        iconSoft: "#1C1F3A",
      },
      personal: {
        badgeBorder: "#3B3F73",
        badgeSoft: "#2A2D55",
        badgeText: "#A5A8F5",
        icon: "#6D66F0",
        iconSoft: "#2A2D55",
      },
    });
  });

  it("keeps canonical avatar pairs separate from accessible initials pairs", () => {
    assert.deepEqual(paletteExports.redesignAvatarTintsLight, [
      { bg: "#EEF0FE", fg: "#4F46E5" },
      { bg: "#FDEBD7", fg: "#C77A2B" },
      { bg: "#E0F0FA", fg: "#2B7AC7" },
      { bg: "#F3E8FA", fg: "#8A46C7" },
      { bg: "#E8F8EE", fg: "#1B8A55" },
    ]);
    assert.deepEqual(paletteExports.redesignAvatarTintsDark, [
      { bg: "#2A2D55", fg: "#A5A8F5" },
      { bg: "#3A2E1B", fg: "#E8B36A" },
      { bg: "#1D344A", fg: "#78BDF0" },
      { bg: "#352743", fg: "#C9A6ED" },
      { bg: "#1D3A31", fg: "#70D5A5" },
    ]);
    assert.deepEqual(paletteExports.redesignAccessibleAvatarTintsLight, [
      { bg: "#EEF0FE", fg: "#4F46E5" },
      { bg: "#FDEBD7", fg: "#9A5E21" },
      { bg: "#E0F0FA", fg: "#276EB4" },
      { bg: "#F3E8FA", fg: "#8A46C7" },
      { bg: "#E8F8EE", fg: "#187A4C" },
    ]);

    const designSpec = readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "docs",
        "superpowers",
        "specs",
        "2026-07-14-whispr-mobile-redesign-design.md",
      ),
      "utf8",
    );
    assert.match(
      designSpec,
      /Accessible light avatar initials use `#4F46E5`, `#9A5E21`, `#276EB4`, `#8A46C7`, and `#187A4C`/,
    );
  });

  it("maps the redesign palette into symmetric semantic theme roles", () => {
    assert.deepEqual(lightTheme.accent, {
      action: "#4F46E5",
      default: "#4F46E5",
      ownerBadge: "#FFF3D6",
      soft: "#EEF0FE",
      softBorder: "#DFE2FC",
      strong: "#3F38C9",
      tabActive: "#4F46E5",
    });
    assert.deepEqual(darkTheme.accent, {
      action: "#6B63EC",
      default: "#6D66F0",
      ownerBadge: "#3A2E1B",
      soft: "#2A2D55",
      softBorder: "#3B3F73",
      strong: "#A5A8F5",
      tabActive: "#A5A8F5",
    });

    assert.deepEqual(lightTheme.border, {
      default: "#F0F1F8",
      focus: "#4F46E5",
      focusRing: "rgba(79,70,229,.15)",
      onSurfaceRing: "#FFFFFF",
      subtle: "#E7E9F4",
      tabBarTop: "#ECEEF6",
    });
    assert.deepEqual(darkTheme.border, {
      default: "#232644",
      focus: "#6D66F0",
      focusRing: "rgba(109,102,240,.24)",
      onSurfaceRing: "#1C1F3A",
      subtle: "#2B2F52",
      tabBarTop: "#2B2F52",
    });

    assert.deepEqual(lightTheme.surface, {
      base: "#F6F7FB",
      card: "#FFFFFF",
      elevated: "#FFFFFF",
      inverse: "#1E2235",
      inverseControl: "rgba(255,255,255,.12)",
      overlay: "#F1F5F9",
      rail: "#EEF0FE",
      scrim: "rgba(0,0,0,.55)",
      soft: "#F6F7FB",
      voiceRoom: "#F6F7FB",
      voiceRoomControl: "#FFFFFF",
      voiceRoomControlBorder: "#E7E9F4",
      voiceRoomInvite: "#FFFFFF",
      voiceRoomInviteBorder: "#E7E9F4",
      voiceRoomParticipant: "#FFFFFF",
      voiceRoomVideo: "#F6F7FB",
      voiceRoomVideoGlass: "rgba(255,255,255,.72)",
    });
    assert.deepEqual(darkTheme.surface, {
      base: "#131529",
      card: "#1C1F3A",
      elevated: "#1C1F3A",
      inverse: "#1E2235",
      inverseControl: "rgba(255,255,255,.12)",
      overlay: "#232644",
      rail: "#1C1F3A",
      scrim: "rgba(0,0,0,.55)",
      soft: "#232644",
      voiceRoom: "#1E2235",
      voiceRoomControl: "rgba(255,255,255,.1)",
      voiceRoomControlBorder: "transparent",
      voiceRoomInvite: "rgba(255,255,255,.04)",
      voiceRoomInviteBorder: "rgba(255,255,255,.15)",
      voiceRoomParticipant: "rgba(255,255,255,.05)",
      voiceRoomVideo: "#12141F",
      voiceRoomVideoGlass: "rgba(18,20,31,.6)",
    });

    assert.deepEqual(lightTheme.text, {
      dateSeparator: "#8A90B0",
      inverse: "#FFFFFF",
      muted: "#676D90",
      onInverse: "#FFFFFF",
      onInverseMuted: "#9BA1C7",
      onPrimary: "#FFFFFF",
      placeholder: "#676D90",
      primary: "#1E2235",
      secondary: "#62688B",
      soft: "#676D90",
      visualFaint: "#8A90B0",
      visualPlaceholder: "#9AA0BC",
      visualSecondary: "#6B7194",
    });
    assert.deepEqual(darkTheme.text, {
      dateSeparator: "#6E7398",
      inverse: "#FFFFFF",
      muted: "#8288AD",
      onInverse: "#FFFFFF",
      onInverseMuted: "#9BA1C7",
      onPrimary: "#FFFFFF",
      placeholder: "#8288AD",
      primary: "#ECEEFA",
      secondary: "#9BA1C7",
      soft: "#8288AD",
      visualFaint: "#6E7398",
      visualPlaceholder: "#6E7398",
      visualSecondary: "#9BA1C7",
    });

    assert.deepEqual(lightTheme.status, {
      danger: "#C94343",
      dangerAction: "#C94343",
      dangerOnBase: "#C84343",
      dangerOnInverse: "#E05252",
      dangerSoft: "#FCE9E9",
      info: "#2563EB",
      infoSoft: "#EFF6FF",
      onStatus: "#1E2235",
      pendingBadge: "#E0527E",
      success: "#22C55E",
      successOnInverse: "#34D399",
      successSoft: "#E8F8EE",
      visualText: "#22A366",
      successText: "#187A4C",
      warning: "#B45309",
      warningSoft: "#FFFBEB",
    });
    assert.deepEqual(darkTheme.status, {
      danger: "#E45A5A",
      dangerAction: "#C94343",
      dangerOnBase: "#E45A5A",
      dangerOnInverse: "#E05252",
      dangerSoft: "rgba(224,82,82,.14)",
      info: "#60A5FA",
      infoSoft: "#172554",
      onStatus: "#ECEEFA",
      pendingBadge: "#E0527E",
      success: "#34D399",
      successOnInverse: "#34D399",
      successSoft: "rgba(52,211,153,.12)",
      visualText: "#34D399",
      successText: "#34D399",
      warning: "#F59E0B",
      warningSoft: "rgba(245,158,11,.14)",
    });
    assert.equal(lightTheme.status.successOnInverse, darkTheme.status.successOnInverse);
    assert.equal(lightTheme.status.dangerOnInverse, darkTheme.status.dangerOnInverse);

    assert.deepEqual(lightTheme.avatarTints, paletteModule.redesignAccessibleAvatarTintsLight);
    assert.deepEqual(darkTheme.avatarTints, paletteModule.redesignAvatarTintsDark);
    assert.equal(lightTheme.avatarTints.length, 5);
    assert.equal(darkTheme.avatarTints.length, 5);
    for (let index = 0; index < lightTheme.avatarTints.length; index += 1) {
      assert.ok(lightTheme.avatarTints[index]);
      assert.ok(darkTheme.avatarTints[index]);
    }
    assert.deepEqual(lightTheme.systemBars, {
      androidNavigationBar: "#F6F7FB",
      statusBar: "dark",
    });
    assert.deepEqual(darkTheme.systemBars, {
      androidNavigationBar: "#131529",
      statusBar: "light",
    });
  });

  it("keeps tokenized application shadows stable", () => {
    assert.deepEqual(lightTheme.elevation.authPrimaryAction, {
      elevation: 10,
      shadowColor: "#4F46E5",
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.32,
      shadowRadius: 24,
    });
    assert.deepEqual(lightTheme.elevation.authBrandMark, {
      elevation: 8,
      shadowColor: "#4360FF",
      shadowOffset: { height: 16, width: 0 },
      shadowOpacity: 0.24,
      shadowRadius: 34,
    });
    assert.deepEqual(lightTheme.elevation.headerCard, {
      elevation: 2,
      shadowColor: "#1E2235",
      shadowOffset: { height: 2, width: 0 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
    });
    assert.deepEqual(lightTheme.elevation.tabBar, {
      elevation: 6,
      shadowColor: "#1E2235",
      shadowOffset: { height: -6, width: 0 },
      shadowOpacity: 0.06,
      shadowRadius: 22,
    });
    assert.deepEqual(lightTheme.elevation.primaryAction, {
      elevation: 6,
      shadowColor: "#4F46E5",
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
    });
    assert.deepEqual(lightTheme.elevation.bottomSheet, {
      elevation: 12,
      shadowColor: "#1E2235",
      shadowOffset: { height: -12, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 40,
    });
    assert.deepEqual(lightTheme.elevation.dangerAction, {
      elevation: 8,
      shadowColor: "#E05252",
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
    });
    assert.deepEqual(lightTheme.elevation.miniVoiceBar, {
      elevation: 10,
      shadowColor: "#1E2235",
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
    });
    assert.deepEqual(darkTheme.elevation.bottomSheet, {
      elevation: 0,
      shadowColor: "#131529",
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    });
    assert.deepEqual(darkTheme.elevation.dangerAction, {
      elevation: 8,
      shadowColor: "#E05252",
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
    });
    assert.deepEqual(darkTheme.elevation.headerCard, {
      elevation: 0,
      shadowColor: "#131529",
      shadowOffset: { height: 0, width: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    });
    assert.deepEqual(darkTheme.elevation.miniVoiceBar, {
      elevation: 10,
      shadowColor: "#1E2235",
      shadowOffset: { height: 10, width: 0 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
    });
    assert.deepEqual(darkTheme.elevation.tabBar, {
      elevation: 6,
      shadowColor: "#000000",
      shadowOffset: { height: -6, width: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 22,
    });
    assert.deepEqual(darkTheme.elevation.primaryAction, {
      elevation: 6,
      shadowColor: "#6D66F0",
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
    });
    assert.deepEqual(darkTheme.elevation.authPrimaryAction, lightTheme.elevation.authPrimaryAction);
    assert.deepEqual(darkTheme.elevation.authBrandMark, lightTheme.elevation.authBrandMark);
    assert.deepEqual(darkTheme.elevation.dangerAction, lightTheme.elevation.dangerAction);
    assert.deepEqual(darkTheme.elevation.miniVoiceBar, lightTheme.elevation.miniVoiceBar);
  });

  it("separates accessible filled actions from canonical decorative accent fills", () => {
    const authPrimaryButton = readFileSync(
      join(process.cwd(), "src", "app", "components", "kit", "auth", "auth-primary-button.tsx"),
      "utf8",
    );
    const authScreenBackground = readFileSync(
      join(process.cwd(), "src", "app", "components", "kit", "auth", "auth-screen-background.tsx"),
      "utf8",
    );
    const uiAtoms = readFileSync(
      join(process.cwd(), "src", "app", "components", "ui-atoms.styles.ts"),
      "utf8",
    );

    assert.match(authPrimaryButton, /solid: \{\s*backgroundColor: theme\.accent\.action,/);
    assert.match(authScreenBackground, /dot: \{\s*backgroundColor: theme\.accent\.default,/);
    assert.match(uiAtoms, /actionButtonPrimary: \{[\s\S]*?backgroundColor: theme\.accent\.action,/);
    assert.match(uiAtoms, /statusChipDotAccent: \{\s*backgroundColor: theme\.accent\.strong,/);
    assert.equal(getMobileThemeCompatibilityColors(lightTheme).primary, lightTheme.accent.action);
    assert.equal(getMobileThemeCompatibilityColors(darkTheme).primary, darkTheme.accent.action);
    assert.equal(getMobileThemeCompatibilityColors(darkTheme).white, darkTheme.text.onPrimary);
  });

  it("uses onStatus for text placed on semantic status surfaces", () => {
    const offlineBanner = readFileSync(
      join(process.cwd(), "src", "app", "components", "mobile-offline-banner.tsx"),
      "utf8",
    );
    const badge = readFileSync(
      join(process.cwd(), "src", "app", "components", "kit", "badge.tsx"),
      "utf8",
    );
    const uiAtoms = readFileSync(
      join(process.cwd(), "src", "app", "components", "ui-atoms.styles.ts"),
      "utf8",
    );
    const voicePanel = readFileSync(
      join(process.cwd(), "src", "voice", "mobile-voice-room-panel.tsx"),
      "utf8",
    );
    const voiceScreenStyles = readFileSync(
      join(process.cwd(), "src", "app", "screens", "voice-screen.styles.ts"),
      "utf8",
    );
    const composerStyles = readFileSync(
      join(process.cwd(), "src", "app", "composer", "mobile-composer.styles.ts"),
      "utf8",
    );

    assert.match(offlineBanner, /backgroundColor: theme\.status\.warningSoft/);
    assert.match(offlineBanner, /color: theme\.status\.onStatus/);
    assert.match(badge, /dangerLabel: \{ color: theme\.status\.onStatus \}/);
    assert.match(uiAtoms, /actionButtonTextDanger: \{\s*color: theme\.status\.onStatus,/);
    assert.match(
      voicePanel,
      /controlButtonDanger: \{[\s\S]*?backgroundColor: theme\.status\.dangerSoft,/,
    );
    assert.match(voicePanel, /controlLabelDanger: \{\s*color: theme\.status\.onStatus,/);
    assert.match(
      voiceScreenStyles,
      /mobileVoiceControlButtonDanger: \{[\s\S]*?backgroundColor: theme\.status\.dangerSoft,/,
    );
    assert.match(
      voiceScreenStyles,
      /mobileVoiceControlLabelDanger: \{\s*color: theme\.status\.onStatus,/,
    );
    assert.match(
      composerStyles,
      /dmSendErrorText: \{[\s\S]*?backgroundColor: theme\.status\.dangerSoft,[\s\S]*?color: theme\.status\.onStatus,/,
    );
  });

  it("composes audited bootstrap and feature-status variant foregrounds", () => {
    const uiAtomComponent = readFileSync(
      join(process.cwd(), "src", "app", "components", "ui-atoms.tsx"),
      "utf8",
    );
    const uiAtomStyles = readFileSync(
      join(process.cwd(), "src", "app", "components", "ui-atoms.styles.ts"),
      "utf8",
    );

    assert.match(
      uiAtomComponent,
      /<Text style=\{\[styles\.environmentLabel, isError && styles\.bootstrapNoticeForegroundError\]\}>/,
    );
    assert.match(
      uiAtomComponent,
      /<Text\s+style=\{\[styles\.contractDescription, isError && styles\.bootstrapNoticeForegroundError\]\}\s*>/,
    );
    assert.match(
      uiAtomComponent,
      /<Text style=\{\[styles\.statusIconText, isAvailable && styles\.statusIconTextSuccess\]\}>/,
    );
    assert.match(
      uiAtomComponent,
      /<Text style=\{\[styles\.environmentLabel, isAvailable && styles\.statusCardTextSuccess\]\}>/,
    );
    assert.match(
      uiAtomComponent,
      /<Text style=\{\[styles\.statusCardTitle, isAvailable && styles\.statusCardTextSuccess\]\}>/,
    );
    assert.match(
      uiAtomComponent,
      /<Text style=\{\[styles\.statusCardDescription, isAvailable && styles\.statusCardTextSuccess\]\}>/,
    );
    assert.match(
      uiAtomStyles,
      /bootstrapNoticeForegroundError: \{\s*color: theme\.status\.onStatus,/,
    );
    assert.match(
      uiAtomStyles,
      /statusIconSuccess: \{[\s\S]*?backgroundColor: theme\.status\.successSoft,/,
    );
    assert.match(uiAtomStyles, /statusIconTextSuccess: \{\s*color: theme\.status\.successText,/);
    assert.match(uiAtomStyles, /statusCardTextSuccess: \{\s*color: theme\.status\.successText,/);
  });

  it("uses audited foregrounds for composed home and lightbox surfaces", () => {
    const homeStyles = readFileSync(
      join(process.cwd(), "src", "app", "screens", "home-screen.styles.ts"),
      "utf8",
    );
    const lightbox = readFileSync(
      join(process.cwd(), "src", "app", "components", "message-image-lightbox.tsx"),
      "utf8",
    );

    assert.match(homeStyles, /homePrimaryServerMeta: \{[\s\S]*?color: theme\.text\.onPrimary,/);
    assert.match(homeStyles, /homeSummaryCard: \{[\s\S]*?backgroundColor: theme\.accent\.action,/);
    // 10b: the close control is part of the viewer's own chrome now, so it reads
    // from the lightbox role instead of the generic inverse surface.
    assert.match(lightbox, /close: \{[\s\S]*?backgroundColor: theme\.lightbox\.control,/);
    assert.match(lightbox, /shareAction: \{[\s\S]*?backgroundColor: theme\.lightbox\.control,/);
    assert.match(lightbox, /<Icon name="close" size=\{24\} tone="inverse" \/>/);
  });

  it("routes standalone base-surface error text through dangerOnBase", () => {
    const sources = [
      join(process.cwd(), "src", "account", "mobile-two-factor-screen.tsx"),
      join(process.cwd(), "src", "app", "screens", "message-thread-screen.styles.ts"),
      join(process.cwd(), "src", "app", "styles", "shared-styles.ts"),
      join(process.cwd(), "src", "social", "friends-hub.tsx"),
      join(process.cwd(), "src", "social", "mobile-profile-avatar-editor.tsx"),
      join(process.cwd(), "src", "workspace", "mobile-server-management.styles.ts"),
    ].map((file) => readFileSync(file, "utf8"));

    for (const source of sources) {
      assert.match(source, /color: theme\.status\.dangerOnBase/);
    }
  });

  it("keeps the lightbox surface dark in both themes", () => {
    // A photo viewer is always a dark room: the light theme must not lighten it.
    assert.deepEqual(lightTheme.lightbox, darkTheme.lightbox);
    assert.deepEqual(lightTheme.lightbox, {
      backdrop: "#08080C",
      chromeGradient: ["rgba(8,8,12,.74)", "rgba(8,8,12,0)"],
      chromeGradientBottom: ["rgba(8,8,12,0)", "rgba(8,8,12,.74)"],
      chromeText: "#FFFFFF",
      chromeTextMuted: "rgba(255,255,255,.72)",
      control: "rgba(255,255,255,.14)",
      controlBorder: "rgba(255,255,255,.20)",
    });
  });

  it("keeps sheet and lightbox backdrops on the dedicated scrim role", () => {
    const bottomSheet = readFileSync(
      join(process.cwd(), "src", "app", "components", "kit", "bottom-sheet.styles.ts"),
      "utf8",
    );
    const lightbox = readFileSync(
      join(process.cwd(), "src", "app", "components", "message-image-lightbox.tsx"),
      "utf8",
    );

    // Both surfaces now darken through the shared overlay backdrop, which fades
    // with the open/close progress instead of snapping with the container. The
    // viewer takes the opaque lightbox role rather than the translucent scrim.
    assert.match(bottomSheet, /backdrop: \{[\s\S]*?backgroundColor: theme\.surface\.scrim,/);
    assert.match(lightbox, /backdrop: \{[\s\S]*?backgroundColor: theme\.lightbox\.backdrop,/);
  });

  it("keeps auth and legacy white-foreground controls on audited contrast pairs", () => {
    const cameraGrid = readFileSync(
      join(process.cwd(), "src", "voice", "mobile-camera-grid.tsx"),
      "utf8",
    );
    const authSecurityCard = readFileSync(
      join(process.cwd(), "src", "app", "components", "kit", "auth", "auth-security-card.tsx"),
      "utf8",
    );
    const uiAtoms = readFileSync(
      join(process.cwd(), "src", "app", "components", "ui-atoms.styles.ts"),
      "utf8",
    );
    const voiceStyles = readFileSync(
      join(process.cwd(), "src", "app", "screens", "voice-screen.styles.ts"),
      "utf8",
    );
    const voiceScreen = readFileSync(
      join(process.cwd(), "src", "app", "screens", "voice-screen.tsx"),
      "utf8",
    );

    assert.match(cameraGrid, /label: \{[\s\S]*?backgroundColor: theme\.surface\.inverse,/);
    assert.match(cameraGrid, /flip: \{[\s\S]*?backgroundColor: theme\.surface\.inverse,/);
    assert.match(authSecurityCard, /icon: \{[\s\S]*?backgroundColor: theme\.status\.successSoft,/);
    assert.match(authSecurityCard, /color=\{theme\.status\.successText\}/);
    assert.match(uiAtoms, /homeMetricTile: \{[\s\S]*?backgroundColor: theme\.accent\.action,/);
    assert.match(
      voiceStyles,
      /mobilePushToTalkIcon: \{[\s\S]*?backgroundColor: theme\.surface\.inverse,/,
    );
    assert.match(voiceScreen, /size=\{24\} color=\{theme\.status\.success\}/);
  });
});
