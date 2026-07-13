import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_IMAGE_UPLOAD_MAX_BYTES,
  MobileImageUploadError,
  parseMobileImageUploadTarget,
  parseMobileUploadCompletion,
  validateMobilePickedImageAsset,
} from "../src/media/mobile-image-upload-contract";

describe("mobile image upload contract", () => {
  it("keeps profile-avatar upload intents free of a server target", () => {
    assert.deepEqual(parseMobileImageUploadTarget({ purpose: "profile-avatar" }), {
      purpose: "profile-avatar",
    });
    assert.throws(
      () => parseMobileImageUploadTarget({ purpose: "profile-avatar", targetServerId: "server-1" }),
      MobileImageUploadError,
    );
  });

  it("requires a bounded server target for server-icon upload intents", () => {
    assert.deepEqual(
      parseMobileImageUploadTarget({ purpose: "server-icon", targetServerId: "server-1" }),
      { purpose: "server-icon", targetServerId: "server-1" },
    );
    assert.throws(
      () => parseMobileImageUploadTarget({ purpose: "server-icon" }),
      MobileImageUploadError,
    );
    assert.throws(
      () =>
        parseMobileImageUploadTarget({
          purpose: "server-icon",
          targetServerId: "x".repeat(129),
        }),
      MobileImageUploadError,
    );
  });

  it("accepts only image types supported by the server upload contract", () => {
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
      assert.doesNotThrow(() =>
        validateMobilePickedImageAsset({
          mimeType,
          sizeBytes: MOBILE_IMAGE_UPLOAD_MAX_BYTES,
          uri: "file:///cache/avatar",
        }),
      );
    }

    assert.throws(
      () =>
        validateMobilePickedImageAsset({
          mimeType: "image/gif",
          sizeBytes: 1,
          uri: "file:///cache/avatar",
        }),
      (error: unknown) => error instanceof MobileImageUploadError && error.code === "unsupported-image-content-type",
    );
  });

  it("rejects a known oversized selection before reading its bytes", () => {
    assert.throws(
      () =>
        validateMobilePickedImageAsset({
          mimeType: "image/jpeg",
          sizeBytes: MOBILE_IMAGE_UPLOAD_MAX_BYTES + 1,
          uri: "file:///cache/avatar",
        }),
      (error: unknown) => error instanceof MobileImageUploadError && error.code === "selected-file-too-large",
    );
  });

  it("permits only volatile local URI schemes", () => {
    for (const uri of ["file:///cache/avatar.jpg", "content://media/images/42", "ph://A1B2"]) {
      assert.doesNotThrow(() =>
        validateMobilePickedImageAsset({ mimeType: "image/png", sizeBytes: 1, uri }),
      );
    }

    for (const uri of [
      "http://example.test/avatar.jpg",
      "https://example.test/avatar.jpg",
      "data:image/png;base64,AA==",
      "",
      `file:///${"a".repeat(4_097)}`,
    ]) {
      assert.throws(
        () => validateMobilePickedImageAsset({ mimeType: "image/png", sizeBytes: 1, uri }),
        (error: unknown) => error instanceof MobileImageUploadError && error.code === "invalid-local-image-uri",
      );
    }
  });

  it("returns only a valid server completion from exactly one upload result", () => {
    const completion = {
      claimId: "claim-1",
      expiresAt: "2026-07-13T12:00:00.000Z",
      purpose: "profile-avatar",
      targetServerId: null,
    } as const;

    assert.deepEqual(
      parseMobileUploadCompletion([
        {
          key: "provider-key",
          serverData: completion,
          url: "https://provider.example.test/private-file",
        },
      ]),
      completion,
    );
    assert.throws(() => parseMobileUploadCompletion([]), MobileImageUploadError);
    assert.throws(
      () => parseMobileUploadCompletion([{ serverData: completion }, { serverData: completion }]),
      MobileImageUploadError,
    );
    assert.throws(
      () => parseMobileUploadCompletion([{ serverData: { ...completion, storageKey: "secret-key" } }]),
      MobileImageUploadError,
    );
  });
});
