import assert from "node:assert/strict";
import test from "node:test";

import {
  MobileImageUploadError,
  resolveMobilePickedImageSize,
  validateMobilePickedImageAsset,
} from "../src/media/mobile-image-upload-contract";

const uri = "file:///tmp/screenshot.png";

/**
 * The picker's `fileSize` describes the asset the user chose; its `uri` points
 * at the copy the picker exported for the app. Those two agree only while the
 * export is a raw byte copy, and UploadThing presigns against whatever it is
 * told — so the file being uploaded is the only honest source.
 */
test("the file that will actually be sent outranks the size the picker claims", () => {
  assert.equal(
    resolveMobilePickedImageSize(9_999, () => 1_234),
    1_234,
  );
});

test("the picker's own number is used when the file cannot be measured", () => {
  assert.equal(
    resolveMobilePickedImageSize(1_234, () => null),
    1_234,
  );
  assert.equal(
    resolveMobilePickedImageSize(1_234, () => 0),
    1_234,
  );
});

/**
 * Android's Photo Picker routinely omits `fileSize`. The old code declared the
 * upload as zero bytes, and UploadThing presigns against the declared size — so
 * the upload was never considered finished and the request never answered.
 */
test("a missing size is measured on disk rather than declared as zero", () => {
  assert.equal(
    resolveMobilePickedImageSize(undefined, () => 2_048),
    2_048,
  );
  assert.equal(
    resolveMobilePickedImageSize(null, () => 2_048),
    2_048,
  );
  assert.equal(
    resolveMobilePickedImageSize(0, () => 2_048),
    2_048,
  );
  assert.equal(
    resolveMobilePickedImageSize(Number.NaN, () => 2_048),
    2_048,
  );
});

test("a size that cannot be established anywhere stays unknown", () => {
  assert.equal(
    resolveMobilePickedImageSize(undefined, () => null),
    null,
  );
  assert.equal(
    resolveMobilePickedImageSize(undefined, () => 0),
    null,
  );
});

test("fractional byte counts are truncated, never rounded up past the real file", () => {
  assert.equal(
    resolveMobilePickedImageSize(1_024.9, () => null),
    1_024,
  );
});

// Rejecting here is the whole point: a hang is worse than a clear refusal.
test("an unmeasurable image is refused instead of uploaded as zero bytes", () => {
  assert.throws(
    () => validateMobilePickedImageAsset({ mimeType: "image/png", sizeBytes: null, uri }),
    (error: unknown) =>
      error instanceof MobileImageUploadError && error.code === "unknown-image-size",
  );
  assert.throws(
    () => validateMobilePickedImageAsset({ mimeType: "image/png", sizeBytes: 0, uri }),
    (error: unknown) =>
      error instanceof MobileImageUploadError && error.code === "unknown-image-size",
  );
});

test("a measured image still has to clear the type and size limits", () => {
  assert.doesNotThrow(() =>
    validateMobilePickedImageAsset({ mimeType: "image/png", sizeBytes: 2_048, uri }),
  );
  assert.throws(
    () =>
      validateMobilePickedImageAsset({
        mimeType: "image/png",
        sizeBytes: 8 * 1024 * 1024,
        uri,
      }),
    (error: unknown) =>
      error instanceof MobileImageUploadError && error.code === "selected-file-too-large",
  );
  assert.throws(
    () => validateMobilePickedImageAsset({ mimeType: "image/gif", sizeBytes: 2_048, uri }),
    (error: unknown) =>
      error instanceof MobileImageUploadError && error.code === "unsupported-image-content-type",
  );
});
