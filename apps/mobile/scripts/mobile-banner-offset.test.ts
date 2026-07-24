import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_BANNER_FOCAL_CENTER,
  clampMobileBannerFocal,
  mobileBannerContentPosition,
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
});
