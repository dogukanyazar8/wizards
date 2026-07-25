import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_BANNER_DRAG_TRAVEL,
  MOBILE_BANNER_FOCAL_CENTER,
  clampMobileBannerFocal,
  mobileBannerContentPosition,
  nextMobileBannerFocal,
} from "../src/social/mobile-banner-offset";

describe("mobile banner focal point", () => {
  it("centers when no offset is stored", () => {
    assert.deepEqual(mobileBannerContentPosition(null, null), { left: "50%", top: "50%" });
    assert.deepEqual(mobileBannerContentPosition(undefined, undefined), {
      left: "50%",
      top: "50%",
    });
  });

  it("maps a normalized focal point to object-position percentages", () => {
    assert.deepEqual(mobileBannerContentPosition(0, 0), { left: "0%", top: "0%" });
    assert.deepEqual(mobileBannerContentPosition(1, 1), { left: "100%", top: "100%" });
    assert.deepEqual(mobileBannerContentPosition(0.25, 0.75), { left: "25%", top: "75%" });
  });

  it("clamps out-of-range and non-finite values back into the frame", () => {
    assert.deepEqual(mobileBannerContentPosition(-0.5, 1.5), { left: "0%", top: "100%" });
    assert.deepEqual(mobileBannerContentPosition(Number.NaN, Number.NaN), {
      left: "50%",
      top: "50%",
    });
  });

  it("clampMobileBannerFocal keeps a raw drag value inside 0..1", () => {
    assert.equal(clampMobileBannerFocal(-0.2), 0);
    assert.equal(clampMobileBannerFocal(1.4), 1);
    assert.equal(clampMobileBannerFocal(0.42), 0.42);
    assert.equal(clampMobileBannerFocal(Number.NaN), MOBILE_BANNER_FOCAL_CENTER);
  });

  it("spreads a short axis over the longer virtual travel so the drag stays fine", () => {
    // The 88px-tall edit preview must not map one finger-pixel to 1.1% of the image.
    assert.equal(nextMobileBannerFocal(0.5, -MOBILE_BANNER_DRAG_TRAVEL / 2, 88), 1);
    assert.equal(nextMobileBannerFocal(0.5, -24, 88), 0.6);
    assert.equal(nextMobileBannerFocal(0.5, 24, 88), 0.4);
  });

  it("keeps the natural 1:1 feel on an axis already wider than the travel", () => {
    assert.equal(nextMobileBannerFocal(0.5, -180, 360), 1);
    assert.equal(nextMobileBannerFocal(0.5, -90, 360), 0.75);
  });

  it("clamps the drag at the frame edges and survives an unmeasured axis", () => {
    assert.equal(nextMobileBannerFocal(0.9, -1000, 88), 1);
    assert.equal(nextMobileBannerFocal(0.1, 1000, 88), 0);
    assert.equal(nextMobileBannerFocal(0.5, -MOBILE_BANNER_DRAG_TRAVEL / 2, 0), 1);
  });
});
