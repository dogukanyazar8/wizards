import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  prepareMobileImageAssetsSequentially,
  toMobilePickedImageBatch,
  type MobilePickerAsset,
} from "../src/media/mobile-image-upload-contract";

type UriFile = { name: string; size: number; type: string; uri: string };

function asUriFile(file: File): UriFile {
  return file as unknown as UriFile;
}

type AssetOverrides = {
  fileSize?: number | null | undefined;
  mimeType?: string | null | undefined;
  uri?: string;
};

const asset = (overrides: AssetOverrides = {}): MobilePickerAsset => ({
  fileSize: 2_048,
  mimeType: "image/jpeg",
  uri: "file:///tmp/one.jpg",
  ...overrides,
});

describe("mobile picked image batch", () => {
  it("prepares selected images one at a time to bound native bitmap memory", async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const assets = [asset({ uri: "file:///tmp/one.jpg" }), asset({ uri: "file:///tmp/two.jpg" })];

    const prepared = await prepareMobileImageAssetsSequentially(assets, async (entry) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push(`start:${entry.uri}`);
      await Promise.resolve();
      order.push(`end:${entry.uri}`);
      active -= 1;
      return entry;
    });

    assert.equal(maxActive, 1);
    assert.deepEqual(prepared, assets);
    assert.deepEqual(order, [
      "start:file:///tmp/one.jpg",
      "end:file:///tmp/one.jpg",
      "start:file:///tmp/two.jpg",
      "end:file:///tmp/two.jpg",
    ]);
  });

  it("keeps every accepted image, in the order the picker returned them", () => {
    const batch = toMobilePickedImageBatch(
      [
        asset({ uri: "file:///tmp/one.jpg" }),
        asset({ mimeType: "image/png", uri: "file:///tmp/two.png" }),
      ],
      () => null,
    );

    assert.deepEqual(batch.failures, []);
    assert.deepEqual(
      batch.picked.map((picked) => picked.localUri),
      ["file:///tmp/one.jpg", "file:///tmp/two.png"],
    );
    assert.deepEqual(
      batch.picked.map((picked) => asUriFile(picked.file).type),
      ["image/jpeg", "image/png"],
    );
    // The URI is what React Native streams; the name only labels the part.
    assert.equal(asUriFile(batch.picked[0]!.file).uri, "file:///tmp/one.jpg");
    assert.equal(asUriFile(batch.picked[1]!.file).name, "mobile-image.png");
  });

  /**
   * One bad image out of three used to be indistinguishable from a broken
   * picker, because the first rejection threw the whole selection away.
   */
  it("reports a rejected image without dropping the ones beside it", () => {
    const batch = toMobilePickedImageBatch(
      [
        asset({ uri: "file:///tmp/one.jpg" }),
        asset({ mimeType: "image/gif", uri: "file:///tmp/two.gif" }),
        asset({ fileSize: 8 * 1024 * 1024, uri: "file:///tmp/three.jpg" }),
      ],
      () => null,
    );

    assert.deepEqual(
      batch.picked.map((picked) => picked.localUri),
      ["file:///tmp/one.jpg"],
    );
    assert.deepEqual(batch.failures, ["unsupported-image-content-type", "selected-file-too-large"]);
  });

  it("measures an image the picker could not size, and refuses what stays unknown", () => {
    const measured = toMobilePickedImageBatch([asset({ fileSize: undefined })], () => 4_096);
    assert.equal(asUriFile(measured.picked[0]!.file).size, 4_096);
    assert.equal(
      asUriFile(toMobilePickedImageBatch([asset({ fileSize: 2_048 })], () => null).picked[0]!.file)
        .size,
      2_048,
    );

    const unmeasurable = toMobilePickedImageBatch([asset({ fileSize: null })], () => null);
    assert.deepEqual(unmeasurable.picked, []);
    assert.deepEqual(unmeasurable.failures, ["unknown-image-size"]);
  });

  it("measures each picked file rather than trusting the picker's byte count", () => {
    const measuredUris: string[] = [];
    const batch = toMobilePickedImageBatch(
      [
        asset({ fileSize: 9_999, uri: "file:///tmp/sized.jpg" }),
        asset({ fileSize: 0, uri: "file:///tmp/bare.jpg" }),
      ],
      (uri) => {
        measuredUris.push(uri);
        return 1_024;
      },
    );

    assert.deepEqual(measuredUris, ["file:///tmp/sized.jpg", "file:///tmp/bare.jpg"]);
    assert.deepEqual(
      batch.picked.map((picked) => asUriFile(picked.file).size),
      [1_024, 1_024],
    );
  });

  it("treats a cancelled picker as an empty batch rather than a failure", () => {
    const batch = toMobilePickedImageBatch([], () => null);

    assert.deepEqual(batch.picked, []);
    assert.deepEqual(batch.failures, []);
  });
});
