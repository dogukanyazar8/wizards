import assert from "node:assert/strict";
import { test } from "node:test";
import { INITIAL_VIDEO_VIEWPORT, reduceVideoViewport } from "../src/voice/mobile-screen-viewport";
const geometry = { width: 800, height: 600, sourceWidth: 1600, sourceHeight: 900 };
test("zoom retains origin, clamps pan, reset and fit discard previous offsets", () => {
  const zoomed = reduceVideoViewport(INITIAL_VIDEO_VIEWPORT, {
    type: "zoomBy",
    delta: 1,
    originX: 100,
    originY: 50,
    geometry,
  });
  assert.equal(zoomed.zoom, 2);
  assert.equal(zoomed.panX, -100);
  assert.equal(zoomed.panY, -50);
  const panned = reduceVideoViewport(zoomed, { type: "panBy", x: 9000, y: -9000, geometry });
  assert.equal(panned.panX, 400);
  assert.equal(panned.panY, -150);
  assert.deepEqual(reduceVideoViewport(panned, { type: "reset" }), INITIAL_VIDEO_VIEWPORT);
  assert.equal(reduceVideoViewport(panned, { type: "toggleFit" }).panX, 0);
  assert.equal(
    reduceVideoViewport(zoomed, { type: "zoomBy", delta: 20, originX: 0, originY: 0, geometry })
      .zoom,
    4,
  );
});
