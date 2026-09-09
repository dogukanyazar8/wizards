import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redesignAuthDark, redesignAuthLight } from "../src/design/palette";
import { mobileAuthMetrics, mobileAuthTypography } from "../src/design/tokens";
import { mobileCopy } from "../src/locale/mobile-copy";

/**
 * SPEC-GIRIS-KAYIT mobil katman denetimi.
 *
 * `design_handoff/giris-kayit-paketi/SPEC.md` §1.1/§1.2 renkleri, §1.3 tipografisi ve §6
 * ölçüleri mobilde CSS tokenı olmadığı için sabit tablolar hâlinde duruyor. Web tarafında
 * `auth-tokens.test.ts` aynı işi CSS üstünde yapıyor; iki yüzeyin ayrışmasını bu dosya yakalar.
 */

/** SPEC §1.1 — açık tema, tablodaki "Çözülen renk" sütunu. */
const SPEC_LIGHT = {
  specBackground: "#F9FAFB",
  specBorder: "#CED3DE",
  specDanger: "#EF435A",
  specDangerSoft: "#82172A",
  specForeground: "#1A202D",
  specPrimary: "#5966F3",
  specPrimaryForeground: "#FFFFFF",
  specSuccess: "#2BAB74",
  specSuccessSoft: "#1E523B",
  specSurfaceCard: "#FFFFFF",
  specSurfaceInset: "#F3F5F9",
  specSurfaceSoft: "#E3E6EE",
  specTextMuted: "#778092",
  specTextSecondary: "#515C70",
  specWarning: "#F4AD2A",
  specWarningSoft: "#573D19",
} as const;

/** SPEC §1.2 — koyu tema, HSL üçlülerinin hex karşılığı. */
const SPEC_DARK = {
  specBackground: "#11151D",
  specBorder: "#3B414F",
  specDanger: "#F15F73",
  specDangerSoft: "#F9A9B3",
  specForeground: "#F3F4F7",
  specPrimary: "#6773F4",
  specPrimaryForeground: "#FFFFFF",
  specSuccess: "#37BE83",
  specSuccessSoft: "#9EE5C7",
  specSurfaceCard: "#1A1E28",
  specSurfaceInset: "#212631",
  specSurfaceSoft: "#2F3541",
  specTextMuted: "#8D95A5",
  specTextSecondary: "#B3BAC6",
  specWarning: "#F7B945",
  specWarningSoft: "#F7D597",
} as const;

const OUTFIT_FACES = new Set(["WhisprOutfit_600SemiBold", "WhisprOutfit_700Bold"]);
const FIGTREE_FACES = new Set([
  "WhisprFigtree_400Regular",
  "WhisprFigtree_500Medium",
  "WhisprFigtree_600SemiBold",
  "WhisprFigtree_700Bold",
]);

describe("mobile auth token contract", () => {
  it("carries every SPEC §1.1 colour on the light palette", () => {
    for (const [key, expected] of Object.entries(SPEC_LIGHT)) {
      assert.equal(
        (redesignAuthLight as Record<string, string>)[key],
        expected,
        `${key} açık temada SPEC değerinde değil.`,
      );
    }
  });

  it("carries every SPEC §1.2 colour on the dark palette", () => {
    for (const [key, expected] of Object.entries(SPEC_DARK)) {
      assert.equal(
        (redesignAuthDark as Record<string, string>)[key],
        expected,
        `${key} koyu temada SPEC değerinde değil.`,
      );
    }
  });

  it("keeps both auth palettes on the same key set", () => {
    assert.deepEqual(Object.keys(redesignAuthLight).sort(), Object.keys(redesignAuthDark).sort());
  });

  it("keeps the SPEC §6 measurements", () => {
    assert.equal(mobileAuthMetrics.minTapTarget, 44);
    assert.equal(mobileAuthMetrics.contentPaddingHorizontal, 28);
    assert.equal(mobileAuthMetrics.deviceRadius, 44);
    assert.equal(mobileAuthMetrics.statusBarHeight, 52);
    assert.equal(mobileAuthMetrics.homeIndicatorWidth, 134);
    assert.equal(mobileAuthMetrics.homeIndicatorHeight, 5);

    assert.equal(mobileAuthMetrics.fieldHeight, 49);
    assert.equal(mobileAuthMetrics.fieldRadius, 14);
    assert.equal(mobileAuthMetrics.primaryButtonHeight, 52);
    assert.equal(mobileAuthMetrics.primaryButtonRadius, 14);
    assert.equal(mobileAuthMetrics.providerButtonHeight, 48);
    assert.equal(mobileAuthMetrics.checkboxSize, 20);
    assert.equal(mobileAuthMetrics.codeCellCount, 6);
    assert.equal(mobileAuthMetrics.codeCellHeight, 62);
    assert.equal(mobileAuthMetrics.codeCellRadius, 14);
    assert.equal(mobileAuthMetrics.pillHeight, 34);
    assert.equal(mobileAuthMetrics.selectorHeight, 34);
    assert.equal(mobileAuthMetrics.selectorSegmentWidth, 30);
  });

  it("keeps the SPEC §2 logo geometry and §6 scales", () => {
    assert.equal(mobileAuthMetrics.markSize, 52);
    assert.equal(mobileAuthMetrics.markRadius, 13);
    assert.equal(mobileAuthMetrics.markBarWidth, 3);
    assert.equal(mobileAuthMetrics.markBarGap, 3);
    assert.deepEqual([...mobileAuthMetrics.markBarHeights], [17, 25, 34, 24, 18]);
    assert.equal(mobileAuthMetrics.markScaleHeading, 0.95);
    assert.equal(mobileAuthMetrics.markScaleInline, 0.72);
    assert.equal(mobileAuthMetrics.ringSize, 74);
  });

  it("never lets an interactive height fall under the tap-target floor", () => {
    const interactive = [
      mobileAuthMetrics.fieldHeight,
      mobileAuthMetrics.primaryButtonHeight,
      mobileAuthMetrics.providerButtonHeight,
      mobileAuthMetrics.backRowMinHeight,
      mobileAuthMetrics.codeCellHeight,
      mobileAuthMetrics.turnstileHeight,
      mobileAuthMetrics.blockingBandHeight,
    ];

    for (const height of interactive) {
      assert.ok(height >= mobileAuthMetrics.minTapTarget, `${height} < 44`);
    }
  });

  it("uses Outfit for headings and numerals, Figtree for body and form (SPEC §1.3)", () => {
    assert.ok(OUTFIT_FACES.has(mobileAuthTypography.eyebrow.fontFamily));
    assert.ok(OUTFIT_FACES.has(mobileAuthTypography.title.fontFamily));
    assert.ok(OUTFIT_FACES.has(mobileAuthTypography.codeDigit.fontFamily));
    assert.ok(OUTFIT_FACES.has(mobileAuthTypography.wordmark.fontFamily));

    assert.ok(FIGTREE_FACES.has(mobileAuthTypography.description.fontFamily));
    assert.ok(FIGTREE_FACES.has(mobileAuthTypography.label.fontFamily));
    assert.ok(FIGTREE_FACES.has(mobileAuthTypography.field.fontFamily));
    assert.ok(FIGTREE_FACES.has(mobileAuthTypography.primaryButton.fontFamily));
    assert.ok(FIGTREE_FACES.has(mobileAuthTypography.providerLabel.fontFamily));
  });

  it("keeps the SPEC §6 type sizes", () => {
    assert.equal(mobileAuthTypography.title.fontSize, 27);
    assert.equal(mobileAuthTypography.eyebrow.fontSize, 10);
    assert.equal(mobileAuthTypography.field.fontSize, 14.75);
    assert.equal(mobileAuthTypography.primaryButton.fontSize, 15);
    assert.equal(mobileAuthTypography.codeDigit.fontSize, 24);
    assert.equal(mobileAuthTypography.wordmark.fontSize, 19);
    assert.equal(mobileAuthTypography.footer.fontSize, 10.5);
  });

  it("mirrors the SPEC §13 copy table on both mobile locales", () => {
    const tr = mobileCopy.tr as unknown as Record<string, string>;
    const en = mobileCopy.en as unknown as Record<string, string>;
    const trKeys = Object.keys(tr)
      .filter((key) => key.startsWith("identity"))
      .sort();
    const enKeys = Object.keys(en)
      .filter((key) => key.startsWith("identity"))
      .sort();

    assert.deepEqual(trKeys, enKeys);
    assert.equal(trKeys.length, 176);

    for (const key of trKeys) {
      assert.ok(tr[key]?.trim().length, `${key} Türkçe boş.`);
      assert.ok(en[key]?.trim().length, `${key} İngilizce boş.`);
    }
  });

  it("keeps a few SPEC §13 lines word for word", () => {
    const tr = mobileCopy.tr as unknown as Record<string, string>;
    const en = mobileCopy.en as unknown as Record<string, string>;

    assert.equal(tr.identityLoginTitle, "Tekrar hoş geldin");
    assert.equal(en.identityLoginTitle, "Welcome back");
    assert.equal(tr.identityTwoFactorRememberDevice, "Bu cihazı 30 gün hatırla");
    assert.equal(en.identityTwoFactorRememberDevice, "Remember this device for 30 days");
    assert.equal(tr.identityRegisterCta, "Hesabı oluştur");
    assert.equal(en.identityRegisterCta, "Create account");
    assert.equal(tr.identityFooterCopyright, "Whispr 2026");
  });
});
