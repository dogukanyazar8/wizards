import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_MOBILE_VIDEO_ASPECT,
  MAX_MOBILE_VIDEO_ASPECT,
  MIN_MOBILE_VIDEO_ASPECT,
  MOBILE_VIDEO_THUMBNAIL_SHORT_EDGE,
  resolveMirror,
  resolveVideoAspect,
  resolveVideoFit,
  resolveVideoSizeClass,
} from "../src/voice/mobile-video-layout";

describe("mobile video layout contract", () => {
  it("derives the tile box from the source instead of a fixed literal", () => {
    assert.equal(resolveVideoAspect({ height: 1080, width: 1920 }), 16 / 9);
    assert.equal(resolveVideoAspect({ height: 1920, width: 1080 }), 9 / 16);
    assert.equal(resolveVideoAspect({ height: 720, width: 720 }), 1);
    assert.equal(resolveVideoAspect({ height: 480, width: 640 }), 4 / 3);
  });

  it("falls back to widescreen when the publication has not reported dimensions", () => {
    assert.equal(DEFAULT_MOBILE_VIDEO_ASPECT, 16 / 9);
    assert.equal(resolveVideoAspect(undefined), 16 / 9);
    assert.equal(resolveVideoAspect(null), 16 / 9);
    assert.equal(resolveVideoAspect({ height: 0, width: 1280 }), 16 / 9);
    assert.equal(resolveVideoAspect({ height: 720, width: 0 }), 16 / 9);
    assert.equal(resolveVideoAspect({ height: Number.NaN, width: 1280 }), 16 / 9);
  });

  it("clamps extreme sources into the allowed box range", () => {
    assert.equal(resolveVideoAspect({ height: 1080, width: 2560 }), MAX_MOBILE_VIDEO_ASPECT);
    assert.equal(resolveVideoAspect({ height: 2560, width: 1080 }), MIN_MOBILE_VIDEO_ASPECT);
  });

  it("classifies size by the short edge, with an uncropped default when unknown", () => {
    assert.equal(MOBILE_VIDEO_THUMBNAIL_SHORT_EDGE, 160);
    assert.equal(resolveVideoSizeClass(159), "thumbnail");
    assert.equal(resolveVideoSizeClass(160), "stage");
    assert.equal(resolveVideoSizeClass(360), "stage");
    assert.equal(resolveVideoSizeClass(null), "stage");
    assert.equal(resolveVideoSizeClass(undefined), "stage");
    assert.equal(resolveVideoSizeClass(0), "stage");
  });

  it("shows the whole frame on readable surfaces and fills only thumbnails", () => {
    assert.equal(resolveVideoFit({ sizeClass: "stage" }), "contain");
    assert.equal(resolveVideoFit({ sizeClass: "thumbnail" }), "cover");
  });

  it("never crops a screen share, whatever the size class", () => {
    assert.equal(resolveVideoFit({ isScreenShare: true, sizeClass: "stage" }), "contain");
    assert.equal(resolveVideoFit({ isScreenShare: true, sizeClass: "thumbnail" }), "contain");
  });

  it("frames a local preview exactly like a remote tile of the same size class", () => {
    // What the publisher sees must be what the room sees: locality may change the
    // mirror, never the box or the crop.
    const portraitPhone = { height: 1920, width: 1080 };
    const frameTile = (isLocal: boolean, shortEdge: number) => ({
      aspect: resolveVideoAspect(portraitPhone),
      fit: resolveVideoFit({ sizeClass: resolveVideoSizeClass(shortEdge) }),
      isLocal,
    });

    for (const shortEdge of [120, 159, 160, 320]) {
      const local = frameTile(true, shortEdge);
      const remote = frameTile(false, shortEdge);

      assert.equal(local.aspect, remote.aspect);
      assert.equal(local.fit, remote.fit);
    }
  });

  it("mirrors only the local front camera", () => {
    assert.equal(resolveMirror({ facingMode: "user", isLocal: true }), true);
    assert.equal(resolveMirror({ facingMode: "environment", isLocal: true }), false);
    assert.equal(resolveMirror({ facingMode: null, isLocal: true }), false);
    assert.equal(resolveMirror({ facingMode: "user", isLocal: false }), false);
    assert.equal(resolveMirror({ facingMode: "environment", isLocal: false }), false);
    assert.equal(resolveMirror({ facingMode: null, isLocal: false }), false);
  });
});
