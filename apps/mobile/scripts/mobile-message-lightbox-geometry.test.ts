import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getMobileLightboxContainedSize,
  getMobileLightboxPanBound,
} from "../src/app/components/message-image-lightbox.geometry";

const viewport = { height: 800, width: 400 };

describe("mobile lightbox contained size", () => {
  it("letterboxes a wide photo to the viewport width", () => {
    assert.deepEqual(getMobileLightboxContainedSize({ height: 1000, width: 2000 }, viewport), {
      height: 200,
      width: 400,
    });
  });

  it("pillarboxes a tall photo to the viewport height", () => {
    assert.deepEqual(getMobileLightboxContainedSize({ height: 4000, width: 1000 }, viewport), {
      height: 800,
      width: 200,
    });
  });

  it("enlarges a photo smaller than the viewport, the way `contain` does", () => {
    assert.deepEqual(getMobileLightboxContainedSize({ height: 50, width: 100 }, viewport), {
      height: 200,
      width: 400,
    });
  });

  it("falls back to the viewport for a source with no usable size", () => {
    assert.deepEqual(getMobileLightboxContainedSize({ height: 0, width: 0 }, viewport), viewport);
  });
});

describe("mobile lightbox pan bound", () => {
  it("is zero while the drawn photo still fits the viewport", () => {
    // A 2:1 photo on this viewport draws 400×200: at 2x it fills the width and
    // is still 400pt short of the height, so only the x axis may pan.
    assert.equal(getMobileLightboxPanBound(400, 400, 2), 200);
    assert.equal(getMobileLightboxPanBound(200, 800, 2), 0);
  });

  it("bounds by the drawn photo, not by the letterboxed frame", () => {
    // The regression: bounding a 400×200 photo by the 800pt frame let the
    // empty bands above and below it be dragged into view.
    assert.equal(getMobileLightboxPanBound(200, 800, 3), 0);
    assert.equal(getMobileLightboxPanBound(800, 800, 3), 800);
  });

  it("grows by half of every point the photo gains past the viewport", () => {
    assert.equal(getMobileLightboxPanBound(400, 400, 1), 0);
    assert.equal(getMobileLightboxPanBound(400, 400, 1.5), 100);
  });
});
