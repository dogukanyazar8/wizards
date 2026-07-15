import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const extractorPath = path.join(mobileRoot, "scripts", "mobile-redesign-extract.ts");

test("canonical extractor captures DPR-3 frames and derives navigation metrics", async () => {
  assert.equal(existsSync(extractorPath), true, "canonical reference extractor must exist");

  const packageJson = JSON.parse(
    readFileSync(path.join(mobileRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.equal(
    packageJson.scripts?.["visual:reference:extract"],
    "node --import tsx scripts/mobile-redesign-extract.ts",
  );

  const extractor = await import("./mobile-redesign-extract");
  const reference = await import("./mobile-redesign-reference");
  const { mobileNavigationMetrics, mobileTypography } = await import("../src/design/tokens");

  assert.equal(
    reference.getReferenceRendererViewportHeight({
      bodyScrollHeight: 11_312,
      documentElementScrollHeight: 10_000,
    }),
    11_312,
    "the renderer viewport must reach frames below the former fixed compositor surface",
  );

  assert.equal(
    extractor.getReferenceFrameSelector("1a"),
    '#\\31 a > div[style*="width:390px"][style*="height:844px"]',
  );
  assert.throws(
    () =>
      extractor.assertReferenceFrameGeometry({
        afterTransform: { height: 844, width: 390 },
        anchor: "missing",
        beforeTransform: { height: 0, width: 0 },
        selectorCount: 0,
      }),
    /match exactly once/i,
  );
  assert.throws(
    () =>
      extractor.assertReferenceFrameGeometry({
        afterTransform: { height: 844, width: 390 },
        anchor: "wrong-border-box",
        beforeTransform: { height: 844, width: 390 },
        selectorCount: 1,
      }),
    /392x846/i,
  );
  assert.throws(
    () =>
      extractor.assertReferenceFrameGeometry({
        afterTransform: { height: 845, width: 390 },
        anchor: "wrong-content-box",
        beforeTransform: { height: 846, width: 392 },
        selectorCount: 1,
      }),
    /390x844/i,
  );

  const manifest = await extractor.extractCanonicalReferenceManifest();

  assert.equal(manifest.version, 1);
  assert.equal(manifest.sourceDateEpoch, "0");
  assert.equal(manifest.deviceScaleFactor, 3);
  assert.equal(manifest.logicalViewport.width, 390);
  assert.equal(manifest.logicalViewport.height, 844);
  assert.equal(manifest.physicalViewport.width, 1170);
  assert.equal(manifest.physicalViewport.height, 2532);
  assert.equal(manifest.sourceHash.length, 64);
  assert.equal(manifest.transformHash.length, 64);
  assert.deepEqual(
    manifest.anchors.map(({ anchor }) => anchor),
    ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "1h", "1i", "1j"],
  );

  for (const anchor of manifest.anchors) {
    assert.equal(anchor.frame.logicalBounds.width, 390, `${anchor.anchor} logical width`);
    assert.equal(anchor.frame.logicalBounds.height, 844, `${anchor.anchor} logical height`);
    assert.equal(anchor.frame.physicalBounds.width, 1170, `${anchor.anchor} physical width`);
    assert.equal(anchor.frame.physicalBounds.height, 2532, `${anchor.anchor} physical height`);
    assert.equal(anchor.frame.screenshotByteLength > 0, true, `${anchor.anchor} screenshot`);
    assert.equal(anchor.nodes.length > 0, true, `${anchor.anchor} computed nodes`);
  }

  const lightOverview = manifest.anchors.find(({ anchor }) => anchor === "1a");
  assert.ok(lightOverview);
  const navigation = lightOverview.navigation;
  if (!navigation) {
    throw new Error("Canonical 1a reference must expose navigation metrics.");
  }
  assert.equal(lightOverview.selectorToTestId[lightOverview.frame.selector], "mobile-overview-screen");
  assert.equal(navigation.tabLabel.fontSize, 10.5);
  assert.equal(typeof navigation.tabLabel.lineHeight, "number");
  assert.equal(navigation.tabLabel.lineHeight > 0, true);
  assert.equal(navigation.miniVoiceBarToTabBarGap > 0, true);
  assert.equal(navigation.tabBarHeight > 0, true);

  assert.equal(mobileTypography.tabLabel.fontSize, 10.5);
  assert.equal(mobileTypography.tabLabel.lineHeight, navigation.tabLabel.lineHeight);
  assert.equal(mobileTypography.tabLabel.letterSpacing, 0);
  assert.equal(mobileTypography.tabLabel.fontFamily, "WhisprJakarta_600SemiBold");
  assert.equal(
    mobileNavigationMetrics.miniVoiceBarToTabBarGap,
    navigation.miniVoiceBarToTabBarGap,
  );
  assert.equal(mobileNavigationMetrics.tabItemPaddingVertical, 8);
  const bottomTabBarSource = readFileSync(
    path.join(mobileRoot, "src", "navigation", "mobile-bottom-tab-bar.tsx"),
    "utf8",
  );
  const floatingChromeSource = readFileSync(
    path.join(mobileRoot, "src", "navigation", "floating-navigation-chrome.tsx"),
    "utf8",
  );
  assert.equal(
    /mobileNavigationMetrics\.miniVoiceBarToTabBarGap/.test(floatingChromeSource),
    true,
  );
  assert.equal(
    /paddingVertical:\s*mobileNavigationMetrics\.tabItemPaddingVertical/.test(bottomTabBarSource),
    true,
  );
});
