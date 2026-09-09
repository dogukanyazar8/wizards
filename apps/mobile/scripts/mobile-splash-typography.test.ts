import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileSplashMetrics, mobileSplashTypography } from "../src/design/tokens";
import { mobileCopy } from "../src/locale/mobile-copy";

/**
 * SPEC-SPLASH §6 mobil karesinin ölçü denetimi.
 *
 * Değerler devir paketinden birebir alındı. Bir sayının kaydığını cihazda görmek
 * yerine burada görmek istiyoruz; ekran dosyası Dalga 3'te bu sabitleri okuyacak.
 */

describe("mobile splash typography", () => {
  it("matches the handoff type scale", () => {
    assert.equal(mobileSplashTypography.wordmark.fontSize, 34);
    assert.equal(mobileSplashTypography.wordmark.fontFamily, "WhisprOutfit_700Bold");
    // SPEC §1: büyük başlıklarda harf aralığı -.02em → 34 × -0.02.
    assert.equal(mobileSplashTypography.wordmark.letterSpacing, -0.68);

    assert.equal(mobileSplashTypography.tagline.fontSize, 13);
    assert.equal(mobileSplashTypography.stepLine.fontSize, 13);
    assert.equal(mobileSplashTypography.stepLine.fontFamily, "WhisprFigtree_500Medium");
    assert.equal(mobileSplashTypography.tip.fontSize, 11.5);
    assert.equal(mobileSplashTypography.version.fontSize, 11);
    assert.equal(mobileSplashTypography.pill.fontSize, 9.5);
    // SPEC §3.3: pill harf aralığı .12em → 9.5 × 0.12.
    assert.equal(mobileSplashTypography.pill.letterSpacing, 1.14);
    // SPEC §7: durum etiketi .14em → 10 × 0.14.
    assert.equal(mobileSplashTypography.stateKicker.letterSpacing, 1.4);
    assert.equal(mobileSplashTypography.stateAction.fontSize, 12.5);
  });

  it("keeps the mark identical to the design system icon", () => {
    assert.equal(mobileSplashMetrics.markSize, 52);
    assert.equal(mobileSplashMetrics.markRadius, 13);
    assert.equal(mobileSplashMetrics.markBarWidth, 3);
    assert.equal(mobileSplashMetrics.markBarGap, 3);
    assert.deepEqual(mobileSplashMetrics.markBarHeights, [17, 25, 34, 24, 18]);
    // SPEC §6: 150px halka içinde `scale(1.75)` ile 91px'lik işaret.
    assert.equal(mobileSplashMetrics.ringSize, 150);
    assert.equal(mobileSplashMetrics.markScale, 1.75);
  });

  it("keeps the footer block on the SPEC grid", () => {
    assert.equal(mobileSplashMetrics.footerPaddingHorizontal, 32);
    assert.equal(mobileSplashMetrics.footerPaddingBottom, 42);
    assert.equal(mobileSplashMetrics.footerGap, 14);
    assert.equal(mobileSplashMetrics.dotSize, 6);
    assert.equal(mobileSplashMetrics.versionRowGap, 8);
    assert.equal(mobileSplashMetrics.wordmarkMarginTop, 16);
    assert.equal(mobileSplashMetrics.taglineMarginTop, 10);
  });

  it("raises only the state button, and only to the tap-target floor", () => {
    // SPEC §7 düğmeyi 32px yazar; mobilde dokunma hedefi alt sınırı 44px.
    assert.equal(mobileSplashMetrics.stateActionHeight, 44);
    assert.equal(mobileSplashMetrics.stateActionPaddingHorizontal, 15);
    assert.equal(mobileSplashMetrics.stateActionRadius, 10);
    assert.equal(mobileSplashMetrics.stateTileSize, 24);
    assert.equal(mobileSplashMetrics.stateTileRadius, 8);
  });

  it("uses only vendored splash families", () => {
    const families = Object.values(mobileSplashTypography).map((value) =>
      typeof value === "string" ? value : value.fontFamily,
    );

    assert.ok(families.length > 0);

    for (const family of families) {
      assert.match(family, /^Whispr(Outfit|Figtree)_\d{3}[A-Za-z]+$/, family);
    }
  });

  it("carries the handoff copy in both languages", () => {
    assert.equal(mobileCopy.tr.splashStepConnecting, "Bağlanıyor");
    assert.equal(mobileCopy.tr.splashStepSession, "Oturum doğrulanıyor");
    assert.equal(mobileCopy.tr.splashStepServers, "Sunucular yükleniyor");
    assert.equal(mobileCopy.tr.splashStepAlmostReady, "Neredeyse hazır");
    assert.equal(mobileCopy.tr.splashTagline, "Sesli sohbet ve topluluk");
    assert.equal(mobileCopy.tr.splashEnvProd, mobileCopy.en.splashEnvProd);

    const english = mobileCopy.en as unknown as Record<string, unknown>;

    for (const key of Object.keys(mobileCopy.tr).filter((name) => name.startsWith("splash"))) {
      assert.equal(typeof english[key], "string", `${key} is missing from the English dictionary`);
    }
  });
});
