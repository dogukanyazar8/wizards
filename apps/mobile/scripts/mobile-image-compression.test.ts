import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_IMAGE_RESCUE_PASSES,
  MOBILE_IMAGE_UPLOAD_MAX_EDGE,
  MOBILE_IMAGE_UPLOAD_TARGET_BYTES,
  optimizeMobileImageForUpload,
  planMobileImageUploadPasses,
  resolveMobileImageResizeSize,
  toMobileImageEncodeFormat,
  toMobileImageMimeType,
} from "../src/media/mobile-image-compression";
import { MOBILE_IMAGE_UPLOAD_MAX_BYTES } from "../src/media/mobile-image-upload-contract";

const OVER_LIMIT = MOBILE_IMAGE_UPLOAD_MAX_BYTES + 1;

describe("mobile image upload plan", () => {
  it("leaves an image that is already small and small enough alone", () => {
    assert.deepEqual(
      planMobileImageUploadPasses({
        height: 1_200,
        mimeType: "image/png",
        sizeBytes: 400_000,
        width: 900,
      }),
      [],
    );
    // Nothing to plan for an image whose size could not be established.
    assert.deepEqual(planMobileImageUploadPasses({ sizeBytes: null }), []);
    assert.deepEqual(planMobileImageUploadPasses({ sizeBytes: 0 }), []);
  });

  /**
   * A 4000 px photo is uploaded, verified and decoded at full resolution to be
   * shown on a phone screen. That is the wait the user reported as "slow".
   */
  it("shrinks an image that is larger than the screen it will be shown on", () => {
    assert.deepEqual(
      planMobileImageUploadPasses({
        height: 3_000,
        mimeType: "image/jpeg",
        sizeBytes: 900_000,
        width: 4_000,
      }),
      [{ compress: 0.85, format: "jpeg", maxEdge: MOBILE_IMAGE_UPLOAD_MAX_EDGE }],
    );
  });

  it("shrinks anything over the soft target, keeping its own format", () => {
    const png = planMobileImageUploadPasses({
      height: 1_000,
      mimeType: "image/png",
      sizeBytes: MOBILE_IMAGE_UPLOAD_TARGET_BYTES + 1,
      width: 1_000,
    });

    // A PNG stays a PNG: turning it into JPEG here would flatten its alpha
    // channel for an image that was going to upload fine either way.
    assert.deepEqual(png, [
      { compress: 0.85, format: "png", maxEdge: MOBILE_IMAGE_UPLOAD_MAX_EDGE },
    ]);
    assert.equal(
      planMobileImageUploadPasses({
        mimeType: "image/webp",
        sizeBytes: MOBILE_IMAGE_UPLOAD_TARGET_BYTES + 1,
      })[0]?.format,
      "webp",
    );
  });

  /**
   * An animated GIF re-encoded as a still is a broken upload, and a format this
   * app cannot encode is better refused with a message than silently converted.
   */
  it("leaves formats it cannot re-encode as a single still frame alone", () => {
    assert.deepEqual(
      planMobileImageUploadPasses({ mimeType: "image/gif", sizeBytes: OVER_LIMIT }),
      [],
    );
    assert.deepEqual(
      planMobileImageUploadPasses({ mimeType: "image/heic", sizeBytes: OVER_LIMIT }),
      [],
    );
    assert.deepEqual(planMobileImageUploadPasses({ sizeBytes: OVER_LIMIT }), []);
  });

  it("falls back to harder JPEG passes only when the image cannot be uploaded at all", () => {
    assert.deepEqual(
      planMobileImageUploadPasses({ mimeType: "image/png", sizeBytes: OVER_LIMIT }),
      MOBILE_IMAGE_RESCUE_PASSES,
    );
  });

  it("never plans an edge above the caller's own bound", () => {
    const passes = planMobileImageUploadPasses(
      { mimeType: "image/png", sizeBytes: OVER_LIMIT },
      { maxEdge: 1_024 },
    );

    assert.deepEqual(
      passes.map((pass) => pass.maxEdge),
      [1_024, 1_024, 1_024],
    );
  });

  it("respects caller limits for a bigger transport", () => {
    // Chat attachments get a larger budget than profile images.
    assert.deepEqual(
      planMobileImageUploadPasses(
        { height: 1_000, mimeType: "image/jpeg", sizeBytes: 2_000_000, width: 1_000 },
        { maxBytes: 8 * 1024 * 1024, targetBytes: 4 * 1024 * 1024 },
      ),
      [],
    );
  });

  it("maps between picker MIME types and encoder formats", () => {
    assert.equal(toMobileImageEncodeFormat("IMAGE/JPEG"), "jpeg");
    assert.equal(toMobileImageEncodeFormat("image/heic"), null);
    assert.equal(toMobileImageEncodeFormat(undefined), null);
    assert.equal(toMobileImageMimeType("png"), "image/png");
  });

  it("constrains the longest edge and never enlarges a small image", () => {
    assert.deepEqual(resolveMobileImageResizeSize(4_000, 3_000, 2_048), { width: 2_048 });
    assert.deepEqual(resolveMobileImageResizeSize(1_440, 3_200, 2_048), { height: 2_048 });
    assert.equal(resolveMobileImageResizeSize(1_200, 900, 2_048), null);
    // Dimensions the picker did not report: compress, but do not guess a size.
    assert.equal(resolveMobileImageResizeSize(null, null, 2_048), null);
    assert.equal(resolveMobileImageResizeSize(0, 0, 2_048), null);
  });
});

describe("optimizeMobileImageForUpload", () => {
  it("does not touch an image the plan left alone", async () => {
    let encodes = 0;
    const result = await optimizeMobileImageForUpload(
      { mimeType: "image/png", sizeBytes: 200_000, uri: "file:///tmp/small.png" },
      {
        async encode() {
          encodes += 1;
          return "file:///tmp/never.jpg";
        },
        measure: () => 100,
      },
    );

    assert.equal(result, null);
    assert.equal(encodes, 0);
  });

  it("stops at the first pass that fits, leaving the harsher ones unused", async () => {
    const attempts: number[] = [];
    const result = await optimizeMobileImageForUpload(
      {
        height: 3_000,
        mimeType: "image/png",
        sizeBytes: OVER_LIMIT,
        uri: "file:///tmp/big.png",
        width: 4_000,
      },
      {
        async encode(input) {
          attempts.push(input.compress);
          return `file:///tmp/pass-${attempts.length}.jpg`;
        },
        measure: () => 1_000_000,
      },
    );

    assert.deepEqual(result, {
      format: "jpeg",
      sizeBytes: 1_000_000,
      uri: "file:///tmp/pass-1.jpg",
    });
    assert.deepEqual(attempts, [MOBILE_IMAGE_RESCUE_PASSES[0]!.compress]);
  });

  it("keeps squeezing while the result is still too big", async () => {
    const sizes = [OVER_LIMIT, OVER_LIMIT, 2_000_000];
    const removed: string[] = [];
    let pass = 0;
    const result = await optimizeMobileImageForUpload(
      {
        height: 4_000,
        mimeType: "image/png",
        sizeBytes: OVER_LIMIT * 3,
        uri: "file:///tmp/big.png",
        width: 4_000,
      },
      {
        async encode() {
          pass += 1;
          return `file:///tmp/pass-${pass}.jpg`;
        },
        measure: () => sizes[pass - 1] ?? null,
        remove: async (uri) => {
          removed.push(uri);
        },
      },
    );

    assert.equal(result?.uri, "file:///tmp/pass-3.jpg");
    assert.equal(pass, 3);
    assert.deepEqual(removed, ["file:///tmp/pass-1.jpg", "file:///tmp/pass-2.jpg"]);
  });

  /** A re-encode that came out bigger is a worse upload, so it is thrown away. */
  it("keeps the original when no pass actually saves bytes", async () => {
    const removed: string[] = [];
    const result = await optimizeMobileImageForUpload(
      {
        height: 1_000,
        mimeType: "image/png",
        sizeBytes: MOBILE_IMAGE_UPLOAD_TARGET_BYTES + 1,
        uri: "file:///tmp/flat.png",
        width: 1_000,
      },
      {
        encode: async () => "file:///tmp/bigger.png",
        measure: () => MOBILE_IMAGE_UPLOAD_TARGET_BYTES * 2,
        remove: async (uri) => {
          removed.push(uri);
        },
      },
    );

    assert.equal(result, null);
    assert.deepEqual(removed, ["file:///tmp/bigger.png"]);
  });

  it("gives up rather than declaring an image that never fit", async () => {
    const result = await optimizeMobileImageForUpload(
      {
        height: 9_000,
        mimeType: "image/png",
        sizeBytes: OVER_LIMIT,
        uri: "file:///tmp/huge.png",
        width: 9_000,
      },
      { encode: async () => "file:///tmp/pass.jpg", measure: () => OVER_LIMIT },
    );

    assert.equal(result, null);
  });

  it("skips a pass whose output cannot be measured", async () => {
    let pass = 0;
    const result = await optimizeMobileImageForUpload(
      {
        height: 3_000,
        mimeType: "image/png",
        sizeBytes: OVER_LIMIT,
        uri: "file:///tmp/big.png",
        width: 4_000,
      },
      {
        async encode() {
          pass += 1;
          return `file:///tmp/pass-${pass}.jpg`;
        },
        measure: () => (pass === 1 ? null : 800_000),
      },
    );

    assert.equal(result?.uri, "file:///tmp/pass-2.jpg");
  });

  it("treats a failed pass as a failed attempt, not as a crash", async () => {
    let pass = 0;
    const result = await optimizeMobileImageForUpload(
      {
        height: 3_000,
        mimeType: "image/png",
        sizeBytes: OVER_LIMIT,
        uri: "file:///tmp/big.png",
        width: 4_000,
      },
      {
        async encode() {
          pass += 1;
          if (pass === 1) {
            throw new Error("native failure");
          }
          return "file:///tmp/pass-2.jpg";
        },
        measure: () => 900_000,
      },
    );

    assert.equal(result?.uri, "file:///tmp/pass-2.jpg");
  });

  it("re-encodes the original on every pass so quality loss cannot compound", async () => {
    const seen: string[] = [];
    await optimizeMobileImageForUpload(
      {
        height: 6_000,
        mimeType: "image/png",
        sizeBytes: OVER_LIMIT,
        uri: "file:///tmp/big.png",
        width: 6_000,
      },
      {
        async encode(input) {
          seen.push(input.uri);
          return "file:///tmp/pass.jpg";
        },
        measure: () => OVER_LIMIT,
      },
    );

    assert.deepEqual(new Set(seen), new Set(["file:///tmp/big.png"]));
    assert.equal(seen.length, MOBILE_IMAGE_RESCUE_PASSES.length);
  });
});
