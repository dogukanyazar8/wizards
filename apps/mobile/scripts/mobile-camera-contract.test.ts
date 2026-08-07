import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_MOBILE_CAMERA_FACING_MODE,
  getMobileCameraCaptureOptions,
  getNextMobileCameraFacingMode,
  sanitizeMobileCameraFacingMode,
} from "../src/voice/mobile-camera-contract";

describe("mobile camera contract", () => {
  it("normalizes and flips between the two supported camera directions", () => {
    assert.equal(DEFAULT_MOBILE_CAMERA_FACING_MODE, "user");
    assert.equal(sanitizeMobileCameraFacingMode("environment"), "environment");
    assert.equal(sanitizeMobileCameraFacingMode("unexpected"), "user");
    assert.equal(getNextMobileCameraFacingMode("user"), "environment");
    assert.equal(getNextMobileCameraFacingMode("environment"), "user");
    assert.deepEqual(getMobileCameraCaptureOptions("environment"), {
      facingMode: "environment",
      frameRate: 30,
      resolution: { frameRate: 30, height: 720, width: 1280 },
    });
  });

  it("keeps the full resolution contract on a flip so the restart cannot fall back", () => {
    const initial = getMobileCameraCaptureOptions(DEFAULT_MOBILE_CAMERA_FACING_MODE);
    const flipped = getMobileCameraCaptureOptions(
      getNextMobileCameraFacingMode(DEFAULT_MOBILE_CAMERA_FACING_MODE),
    );

    assert.deepEqual(flipped.resolution, initial.resolution);
    assert.deepEqual(flipped.resolution, { frameRate: 30, height: 720, width: 1280 });
    assert.equal(flipped.facingMode, "environment");
    assert.equal(Object.hasOwn(flipped.resolution ?? {}, "aspectRatio"), false);
  });

  it("captures the requested tier without an aspect-ratio constraint", () => {
    const high = getMobileCameraCaptureOptions("user", "h1080");

    assert.deepEqual(high.resolution, { frameRate: 30, height: 1080, width: 1920 });
    assert.equal(Object.hasOwn(high, "aspectRatio"), false);
  });
});
