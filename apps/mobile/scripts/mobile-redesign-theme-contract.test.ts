import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as paletteModule from "../src/design/palette";

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
      success: "#34D399",
      successSurface: "rgba(52,211,153,.12)",
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
});
