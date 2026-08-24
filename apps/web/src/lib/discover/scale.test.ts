import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DISCOVER_PAGE_SIZES,
  selectDiscoverPageSize,
  selectDiscoverPageSizeForScale,
} from "./scale";

describe("Keşfet ilk sayfa yoğunluğu", () => {
  it("dört ölçek adımını 24, 24, 36, 48 kayda eşler", () => {
    assert.deepEqual(DISCOVER_PAGE_SIZES, { 1: 24, 1.15: 24, 1.5: 36, 2: 48 });
    assert.equal(selectDiscoverPageSizeForScale(1), 24);
    assert.equal(selectDiscoverPageSizeForScale(1.15), 24);
    assert.equal(selectDiscoverPageSizeForScale(1.5), 36);
    assert.equal(selectDiscoverPageSizeForScale(2), 48);
  });

  it("min(vw/1360, vh/920) ile dört eşikte doğru boyutu seçer", () => {
    assert.equal(selectDiscoverPageSize({ height: 920, width: 1360 }), 24);
    assert.equal(selectDiscoverPageSize({ height: 1080, width: 1920 }), 24);
    assert.equal(selectDiscoverPageSize({ height: 1440, width: 2560 }), 36);
    assert.equal(selectDiscoverPageSize({ height: 2160, width: 3840 }), 48);
  });

  it("ultra genişte kısa eksenle sınırlanır ve ×2 üstüne çıkmaz", () => {
    assert.equal(selectDiscoverPageSize({ height: 1440, width: 5120 }), 36);
    assert.equal(selectDiscoverPageSize({ height: 100_000, width: 100_000 }), 48);
  });
});
