import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mobileRadii,
  mobileSizing,
  mobileSpacing,
  mobileTypography,
} from "../src/design/tokens";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("mobile design contract", () => {
  it("keeps native touch targets and compact surfaces production-safe", () => {
    assert.equal(mobileSizing.minTouchTarget >= 44, true);
    assert.equal(mobileRadii.card <= 22, true);
    assert.equal(mobileRadii.control <= mobileRadii.card, true);
    assert.equal(mobileSpacing.page <= 24, true);
    assert.equal(mobileSpacing.section <= mobileSpacing.page, true);
  });

  it("keeps inline mobile content bounded for compact phones", () => {
    assert.equal(mobileSizing.maxInlineContentWidth >= 360, true);
    assert.equal(mobileSizing.maxInlineContentWidth <= 640, true);
  });

  it("uses Outfit as the app-wide mobile font contract", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const rootSource = readFileSync(
      join(process.cwd(), "src", "app", "whispr-mobile-root.tsx"),
      "utf8",
    );

    assert.equal(mobileTypography.fontFamily, "Outfit");
    assert.ok(packageJson.dependencies?.["@expo-google-fonts/outfit"]);
    assert.ok(packageJson.dependencies?.["expo-font"]);
    assert.match(rootSource, /useOutfitFonts/);
  });
});
