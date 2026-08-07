import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Track } from "livekit-client";

import {
  DEFAULT_SCREEN_SHARE_QUALITY_ID,
  SCREEN_SHARE_DEGRADATION_PREFERENCE,
  SCREEN_SHARE_QUALITY_OPTIONS,
  SCREEN_SHARE_SCALABILITY_MODE,
  SCREEN_SHARE_VIDEO_CODEC,
  getScreenSharePublishOptions,
  getScreenShareQualityPreset,
} from "./screen-share";
import {
  CAMERA_DEGRADATION_PREFERENCE,
  CAMERA_SCALABILITY_MODE,
  CAMERA_VIDEO_CODEC,
  DEFAULT_CAMERA_QUALITY_TIER,
  SCREEN_SHARE_INERT_CAMERA_ROOM_DEFAULT_KEYS,
  getCameraCaptureOptions,
  getCameraEncoding,
  getCameraPublishOptions,
  getCameraResolution,
  getCameraRoomDefaults,
  getCameraRoomPublishDefaults,
  isCameraQualityTier,
  normalizeCameraQualityTier,
} from "./video-quality";

describe("web camera video quality contract", () => {
  it("publishes VP9 SVC with an explicit encoder budget per tier", () => {
    assert.equal(CAMERA_VIDEO_CODEC, "vp9");
    assert.equal(CAMERA_SCALABILITY_MODE, "L3T3_KEY");
    assert.equal(CAMERA_DEGRADATION_PREFERENCE, "maintain-framerate");

    const highTier = getCameraPublishOptions("h1080");
    assert.equal(highTier.videoCodec, "vp9");
    assert.equal(highTier.scalabilityMode, "L3T3_KEY");
    assert.equal(highTier.backupCodec, true);
    assert.equal(highTier.degradationPreference, "maintain-framerate");
    assert.equal(highTier.source, Track.Source.Camera);
    assert.deepEqual(highTier.videoEncoding, { maxBitrate: 4_000_000, maxFramerate: 30 });

    const lowTier = getCameraPublishOptions("h720");
    assert.deepEqual(lowTier.videoEncoding, { maxBitrate: 2_500_000, maxFramerate: 30 });
  });

  it("beats the livekit default 1.7 Mbps VP8 camera publication", () => {
    const previousDefaultMaxBitrate = 1_700_000;

    assert.ok(getCameraEncoding("h720").maxBitrate > previousDefaultMaxBitrate);
    assert.ok(getCameraEncoding("h1080").maxBitrate > previousDefaultMaxBitrate);
  });

  it("captures plain resolutions so no aspect-ratio constraint reaches getUserMedia", () => {
    const captureOptions = getCameraCaptureOptions("h1080");

    assert.deepEqual(captureOptions.resolution, { frameRate: 30, height: 1080, width: 1920 });
    assert.equal("aspectRatio" in (captureOptions.resolution ?? {}), false);
    assert.equal(Object.hasOwn(captureOptions, "aspectRatio"), false);
    assert.deepEqual(getCameraResolution("h720"), { frameRate: 30, height: 720, width: 1280 });
  });

  it("only names a device when one was selected", () => {
    assert.equal(getCameraCaptureOptions("h720").deviceId, undefined);
    assert.equal(Object.hasOwn(getCameraCaptureOptions("h720"), "deviceId"), false);
    assert.equal(getCameraCaptureOptions("h720", "camera-9").deviceId, "camera-9");
  });

  it("carries the whole camera contract in the room-wide publish defaults", () => {
    const roomDefaults = getCameraRoomDefaults();

    assert.deepEqual(roomDefaults.publishDefaults, {
      backupCodec: true,
      degradationPreference: "maintain-framerate",
      scalabilityMode: "L3T3_KEY",
      videoCodec: "vp9",
      videoEncoding: getCameraEncoding(DEFAULT_CAMERA_QUALITY_TIER),
    });
    assert.deepEqual(getCameraRoomPublishDefaults("h720").videoEncoding, getCameraEncoding("h720"));
    assert.deepEqual(
      roomDefaults.videoCaptureDefaults,
      getCameraCaptureOptions(DEFAULT_CAMERA_QUALITY_TIER),
    );
  });

  it("keeps the room defaults a pure safety net for the per-publish options", () => {
    const publishOptions = getCameraPublishOptions("h1080");

    for (const [key, value] of Object.entries(getCameraRoomPublishDefaults("h1080"))) {
      assert.deepEqual(
        publishOptions[key as keyof typeof publishOptions],
        value,
        `getCameraPublishOptions must restate ${key} with the same value`,
      );
    }

    assert.equal(publishOptions.source, Track.Source.Camera);
  });

  it("defaults to 1080p and rejects unknown tiers", () => {
    assert.equal(DEFAULT_CAMERA_QUALITY_TIER, "h1080");
    assert.equal(isCameraQualityTier("h720"), true);
    assert.equal(isCameraQualityTier("h1440"), false);
    assert.equal(normalizeCameraQualityTier("h1440"), "h1080");
    assert.equal(normalizeCameraQualityTier("h720"), "h720");
    assert.deepEqual(getCameraResolution(), getCameraResolution("h1080"));
  });

  it("hands out copies so a caller cannot mutate the shared contract", () => {
    const first = getCameraEncoding("h720");
    first.maxBitrate = 1;

    assert.equal(getCameraEncoding("h720").maxBitrate, 2_500_000);
  });
});

describe("web camera room defaults cannot silently reach a screen share", () => {
  const inertKeys: string[] = Object.keys(SCREEN_SHARE_INERT_CAMERA_ROOM_DEFAULT_KEYS);

  it("has no stale entry in the inert-key escape hatch", () => {
    const roomDefaultKeys = Object.keys(getCameraRoomPublishDefaults());

    for (const key of inertKeys) {
      assert.ok(
        roomDefaultKeys.includes(key),
        `${key} is listed as inert but is not a room publish default`,
      );
    }
  });

  for (const tier of ["h720", "h1080"] as const) {
    for (const quality of SCREEN_SHARE_QUALITY_OPTIONS) {
      it(`restates every ${tier} room default in the ${quality.id} screen share publish options`, () => {
        const roomDefaults = getCameraRoomPublishDefaults(tier);
        const screenShareOptions = getScreenSharePublishOptions(quality.id);

        for (const key of Object.keys(roomDefaults)) {
          if (inertKeys.includes(key)) {
            assert.equal(
              Object.hasOwn(screenShareOptions, key),
              false,
              `${key} is documented as inert but the screen share options now set it — drop it from SCREEN_SHARE_INERT_CAMERA_ROOM_DEFAULT_KEYS`,
            );
            continue;
          }

          assert.ok(
            Object.hasOwn(screenShareOptions, key),
            `screen share would inherit the camera value for ${key} from the room publish defaults`,
          );
        }
      });
    }
  }

  it("negotiates the screen share codec contract even after the merge", () => {
    const merged = {
      ...getCameraRoomPublishDefaults("h1080"),
      ...getScreenSharePublishOptions(DEFAULT_SCREEN_SHARE_QUALITY_ID),
    };

    assert.equal(merged.videoCodec, SCREEN_SHARE_VIDEO_CODEC);
    assert.equal(merged.degradationPreference, SCREEN_SHARE_DEGRADATION_PREFERENCE);
    assert.equal(merged.scalabilityMode, SCREEN_SHARE_SCALABILITY_MODE);
    assert.equal(merged.source, Track.Source.ScreenShare);
    assert.deepEqual(
      merged.screenShareEncoding,
      getScreenShareQualityPreset(DEFAULT_SCREEN_SHARE_QUALITY_ID).encoding,
    );
  });
});
