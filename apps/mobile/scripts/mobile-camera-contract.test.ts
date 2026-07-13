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
    });
  });
});
