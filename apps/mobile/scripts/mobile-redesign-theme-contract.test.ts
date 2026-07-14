import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import * as paletteModule from "../src/design/palette";
import { getMobileThemeCompatibilityColors } from "../src/design/mobile-theme-compat";
import { darkTheme, lightTheme } from "../src/design/themes";

const paletteExports = paletteModule as Record<string, unknown>;

describe("mobile redesign palette contract", () => {
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
      lavender: "#EEF0FE",
      lavenderBorder: "#DFE2FC",
      success: "#22C55E",
      canonicalSuccessText: "#22A366",
      successSurface: "#E8F8EE",
      canonicalSuccessTextDeep: "#1B8A55",
      successText: "#187A4C",
      canonicalDanger: "#E05252",
      danger: "#C94343",
      dangerOnBase: "#C84343",
      dangerSurface: "#FCE9E9",
      inkSurface: "#1E2235",
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
      accentText: "#A5A8F5",
      selectedSurface: "#2A2D55",
      selectedBorder: "#3B3F73",
      canonicalDanger: "#E05252",
      danger: "#E45A5A",
      dangerAction: "#C94343",
      dangerOnBase: "#E45A5A",
      dangerSurface: "rgba(224,82,82,.14)",
      success: "#34D399",
      successSurface: "rgba(52,211,153,.12)",
      warning: "#F59E0B",
      warningSurface: "rgba(245,158,11,.14)",
      sheetOverlay: "rgba(0,0,0,.55)",
    });
  });

  it("exports only the canonical fallback avatar tint pairs", () => {
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
    ]);
  });

  it("maps the redesign palette into symmetric semantic theme roles", () => {
    assert.deepEqual(lightTheme.accent, {
      action: "#4F46E5",
      default: "#4F46E5",
      soft: "#EEF0FE",
      softBorder: "#DFE2FC",
      strong: "#3F38C9",
    });
    assert.deepEqual(darkTheme.accent, {
      action: "#6B63EC",
      default: "#6D66F0",
      soft: "#2A2D55",
      softBorder: "#3B3F73",
      strong: "#A5A8F5",
    });

    assert.deepEqual(lightTheme.border, {
      default: "#F0F1F8",
      focus: "#4F46E5",
      subtle: "#E7E9F4",
    });
    assert.deepEqual(darkTheme.border, {
      default: "#232644",
      focus: "#6D66F0",
      subtle: "#2B2F52",
    });

    assert.deepEqual(lightTheme.surface, {
      base: "#F6F7FB",
      card: "#FFFFFF",
      elevated: "#FFFFFF",
      inverse: "#1E2235",
      overlay: "#F1F5F9",
      rail: "#EEF0FE",
      scrim: "rgba(0,0,0,.55)",
      soft: "#F6F7FB",
    });
    assert.deepEqual(darkTheme.surface, {
      base: "#131529",
      card: "#1C1F3A",
      elevated: "#1C1F3A",
      inverse: "#1E2235",
      overlay: "#232644",
      rail: "#1C1F3A",
      scrim: "rgba(0,0,0,.55)",
      soft: "#232644",
    });

    assert.deepEqual(lightTheme.text, {
      inverse: "#FFFFFF",
      muted: "#676D90",
      onInverse: "#FFFFFF",
      onPrimary: "#FFFFFF",
      placeholder: "#676D90",
      primary: "#1E2235",
      secondary: "#62688B",
      soft: "#676D90",
    });
    assert.deepEqual(darkTheme.text, {
      inverse: "#FFFFFF",
      muted: "#8288AD",
      onInverse: "#FFFFFF",
      onPrimary: "#FFFFFF",
      placeholder: "#8288AD",
      primary: "#ECEEFA",
      secondary: "#9BA1C7",
      soft: "#8288AD",
    });

    assert.deepEqual(lightTheme.status, {
      danger: "#C94343",
      dangerAction: "#C94343",
      dangerOnBase: "#C84343",
      dangerSoft: "#FCE9E9",
      info: "#2563EB",
      infoSoft: "#EFF6FF",
      onStatus: "#1E2235",
      success: "#22C55E",
      successSoft: "#E8F8EE",
      successText: "#187A4C",
      warning: "#B45309",
      warningSoft: "#FFFBEB",
    });
    assert.deepEqual(darkTheme.status, {
      danger: "#E45A5A",
      dangerAction: "#C94343",
      dangerOnBase: "#E45A5A",
      dangerSoft: "rgba(224,82,82,.14)",
      info: "#60A5FA",
      infoSoft: "#172554",
      onStatus: "#ECEEFA",
      success: "#34D399",
      successSoft: "rgba(52,211,153,.12)",
      successText: "#34D399",
      warning: "#F59E0B",
      warningSoft: "rgba(245,158,11,.14)",
    });

    assert.deepEqual(lightTheme.avatarTints, paletteModule.redesignAvatarTintsLight);
    assert.deepEqual(darkTheme.avatarTints, paletteModule.redesignAvatarTintsDark);
    assert.ok(lightTheme.avatarTints.length > 0);
    assert.ok(darkTheme.avatarTints.length > 0);
    assert.deepEqual(lightTheme.systemBars, {
      androidNavigationBar: "#F6F7FB",
      statusBar: "dark",
    });
    assert.deepEqual(darkTheme.systemBars, {
      androidNavigationBar: "#131529",
      statusBar: "light",
    });
  });

  it("uses the audited native shadow values and no dark-theme shadows", () => {
    assert.deepEqual(lightTheme.elevation.card, {
      elevation: 6,
      shadowColor: "#1E2235",
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 24,
    });
    assert.deepEqual(lightTheme.elevation.soft, {
      elevation: 6,
      shadowColor: "#4F46E5",
      shadowOffset: { height: 6, width: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
    });
    for (const elevation of Object.values(darkTheme.elevation)) {
      assert.equal(elevation.elevation, 0);
      assert.equal(elevation.shadowOpacity, 0);
      assert.equal(elevation.shadowRadius, 0);
    }
  });

  it("separates accessible filled actions from canonical decorative accent fills", () => {
    const authStyles = readFileSync(
      join(process.cwd(), "src", "app", "screens", "auth-gate.styles.ts"),
      "utf8",
    );
    const uiAtoms = readFileSync(
      join(process.cwd(), "src", "app", "components", "ui-atoms.styles.ts"),
      "utf8",
    );

    assert.match(
      authStyles,
      /premiumAuthPrimaryButton: \{[\s\S]*?backgroundColor: theme\.accent\.action,/,
    );
    assert.match(authStyles, /premiumAuthDot: \{[\s\S]*?backgroundColor: theme\.accent\.default,/);
    assert.match(
      authStyles,
      /premiumAuthStrengthFillAccent: \{\s*backgroundColor: theme\.accent\.strong,/,
    );
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

    assert.match(offlineBanner, /backgroundColor: theme\.status\.warningSoft/);
    assert.match(offlineBanner, /color: theme\.status\.onStatus/);
    assert.match(badge, /dangerLabel: \{ color: theme\.status\.onStatus \}/);
    assert.match(uiAtoms, /actionButtonTextDanger: \{\s*color: theme\.status\.onStatus,/);
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
    assert.match(lightbox, /close: \{[\s\S]*?backgroundColor: theme\.surface\.inverse,/);
    assert.match(lightbox, /<Icon name="close" size=\{24\} tone="inverse" \/>/);
  });

  it("routes standalone base-surface error text through dangerOnBase", () => {
    const sources = [
      join(process.cwd(), "src", "account", "mobile-two-factor-screen.tsx"),
      join(process.cwd(), "src", "app", "screens", "message-thread-screen.tsx"),
      join(process.cwd(), "src", "app", "styles", "shared-styles.ts"),
      join(process.cwd(), "src", "social", "friends-hub.tsx"),
      join(process.cwd(), "src", "social", "mobile-profile-avatar-editor.tsx"),
      join(process.cwd(), "src", "workspace", "mobile-server-management.styles.ts"),
    ].map((file) => readFileSync(file, "utf8"));

    for (const source of sources) {
      assert.match(source, /color: theme\.status\.dangerOnBase/);
    }
  });

  it("keeps sheet and lightbox backdrops on the dedicated scrim role", () => {
    const bottomSheet = readFileSync(
      join(process.cwd(), "src", "app", "components", "kit", "bottom-sheet.tsx"),
      "utf8",
    );
    const lightbox = readFileSync(
      join(process.cwd(), "src", "app", "components", "message-image-lightbox.tsx"),
      "utf8",
    );

    assert.match(bottomSheet, /backdrop: \{[\s\S]*?backgroundColor: theme\.surface\.scrim,/);
    assert.match(lightbox, /root: \{[\s\S]*?backgroundColor: theme\.surface\.scrim,/);
  });

  it("keeps legacy white-foreground controls on audited contrast pairs", () => {
    const cameraGrid = readFileSync(
      join(process.cwd(), "src", "voice", "mobile-camera-grid.tsx"),
      "utf8",
    );
    const authStyles = readFileSync(
      join(process.cwd(), "src", "app", "screens", "auth-gate.styles.ts"),
      "utf8",
    );
    const authScreen = readFileSync(
      join(process.cwd(), "src", "app", "screens", "auth-gate.tsx"),
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
    assert.match(
      authStyles,
      /premiumAuthSecurityIcon: \{[\s\S]*?backgroundColor: theme\.status\.successSoft,/,
    );
    assert.match(authScreen, /shield-checkmark" size=\{21\} color=\{theme\.status\.successText\}/);
    assert.match(uiAtoms, /homeMetricTile: \{[\s\S]*?backgroundColor: theme\.accent\.action,/);
    assert.match(
      voiceStyles,
      /mobilePushToTalkIcon: \{[\s\S]*?backgroundColor: theme\.surface\.inverse,/,
    );
    assert.match(voiceScreen, /size=\{24\} color=\{theme\.status\.success\}/);
  });
});
