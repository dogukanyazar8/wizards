import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_IMAGE_COMPRESSION_STEPS,
  compressMobileImageToLimit,
  needsMobileImageCompression,
  resolveMobileImageResizeSize,
} from "../src/media/mobile-image-compression";
import { MOBILE_IMAGE_UPLOAD_MAX_BYTES } from "../src/media/mobile-image-upload-contract";

const OVER_LIMIT = MOBILE_IMAGE_UPLOAD_MAX_BYTES + 1;

describe("mobile image compression", () => {
  it("leaves an image that already fits completely alone", () => {
    assert.equal(needsMobileImageCompression(MOBILE_IMAGE_UPLOAD_MAX_BYTES), false);
    assert.equal(needsMobileImageCompression(OVER_LIMIT), true);
    // An unmeasurable image is not silently re-encoded: it is refused upstream.
    assert.equal(needsMobileImageCompression(null), false);
  });

  it("constrains the longest edge and never enlarges a small image", () => {
    assert.deepEqual(resolveMobileImageResizeSize(4_000, 3_000, 2_048), { width: 2_048 });
    assert.deepEqual(resolveMobileImageResizeSize(1_440, 3_200, 2_048), { height: 2_048 });
    assert.equal(resolveMobileImageResizeSize(1_200, 900, 2_048), null);
    // Dimensions the picker did not report: compress, but do not guess a size.
    assert.equal(resolveMobileImageResizeSize(null, null, 2_048), null);
    assert.equal(resolveMobileImageResizeSize(0, 0, 2_048), null);
  });

  it("stops at the first pass that fits, leaving the harsher ones unused", async () => {
    const attempts: number[] = [];
    const result = await compressMobileImageToLimit(
      { height: 3_000, sizeBytes: OVER_LIMIT, uri: "file:///tmp/big.png", width: 4_000 },
      {
        async compress(input) {
          attempts.push(input.compress);
          return `file:///tmp/pass-${attempts.length}.jpg`;
        },
        measure: () => 1_000_000,
      },
    );

    assert.deepEqual(result, { sizeBytes: 1_000_000, uri: "file:///tmp/pass-1.jpg" });
    assert.deepEqual(attempts, [MOBILE_IMAGE_COMPRESSION_STEPS[0]!.compress]);
  });

  it("keeps squeezing while the result is still too big", async () => {
    const sizes = [OVER_LIMIT, OVER_LIMIT, 2_000_000];
    let pass = 0;
    const result = await compressMobileImageToLimit(
      { height: 4_000, sizeBytes: OVER_LIMIT * 3, uri: "file:///tmp/big.png", width: 4_000 },
      {
        async compress() {
          pass += 1;
          return `file:///tmp/pass-${pass}.jpg`;
        },
        measure: () => sizes[pass - 1] ?? null,
      },
    );

    assert.deepEqual(result, { sizeBytes: 2_000_000, uri: "file:///tmp/pass-3.jpg" });
    assert.equal(pass, 3);
  });

  /** A refusal the user can act on beats an upload the service would reject. */
  it("gives up rather than declaring an image that never fit", async () => {
    const result = await compressMobileImageToLimit(
      { height: 9_000, sizeBytes: OVER_LIMIT, uri: "file:///tmp/huge.png", width: 9_000 },
      { compress: async () => "file:///tmp/pass.jpg", measure: () => OVER_LIMIT },
    );

    assert.equal(result, null);
  });

  it("gives up on a pass whose output cannot be measured", async () => {
    const result = await compressMobileImageToLimit(
      { height: 3_000, sizeBytes: OVER_LIMIT, uri: "file:///tmp/big.png", width: 4_000 },
      { compress: async () => "file:///tmp/pass.jpg", measure: () => null },
    );

    assert.equal(result, null);
  });

  it("treats a failed pass as a failed attempt, not as a crash", async () => {
    let pass = 0;
    const result = await compressMobileImageToLimit(
      { height: 3_000, sizeBytes: OVER_LIMIT, uri: "file:///tmp/big.png", width: 4_000 },
      {
        async compress() {
          pass += 1;
          if (pass === 1) {
            throw new Error("native failure");
          }
          return "file:///tmp/pass-2.jpg";
        },
        measure: () => 900_000,
      },
    );

    assert.deepEqual(result, { sizeBytes: 900_000, uri: "file:///tmp/pass-2.jpg" });
  });

  it("passes each step's own quality and edge down to the encoder", async () => {
    const seen: { compress: number; maxEdge: number; uri: string }[] = [];
    await compressMobileImageToLimit(
      { height: 6_000, sizeBytes: OVER_LIMIT, uri: "file:///tmp/big.png", width: 6_000 },
      {
        async compress(input) {
          seen.push(input);
          return "file:///tmp/pass.jpg";
        },
        measure: () => OVER_LIMIT,
      },
    );

    assert.deepEqual(seen, [
      ...MOBILE_IMAGE_COMPRESSION_STEPS.map((step) => ({
        compress: step.compress,
        maxEdge: step.maxEdge,
        uri: "file:///tmp/big.png",
      })),
    ]);
    // Every pass re-encodes the original, so quality loss never compounds.
    assert.equal(new Set(seen.map((entry) => entry.uri)).size, 1);
  });
});
