import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  Track,
  VideoPresets,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from "livekit-client";

import {
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  MOBILE_SCREEN_SHARE_DEGRADATION_PREFERENCE,
  MOBILE_SCREEN_SHARE_QUALITY_OPTIONS,
  MOBILE_SCREEN_SHARE_VIDEO_CODEC,
  getMobileScreenSharePublishOptions,
} from "../src/voice/mobile-screen-share";
import {
  applyMobileVoiceAudioBitrate,
  DEFAULT_MOBILE_CAMERA_QUALITY_TIER,
  MOBILE_CAMERA_FALLBACK_CODEC,
  MOBILE_CAMERA_VIDEO_CODEC,
  SCREEN_SHARE_INERT_MOBILE_CAMERA_ROOM_DEFAULT_KEYS,
  buildMobileCameraCaptureOptions,
  enableMobileCameraWithCodecFallback,
  getMobileCameraEncoding,
  getMobileCameraPublishOptions,
  getMobileCameraResolution,
  getMobileCameraRoomDefaults,
  getMobileCameraRoomPublishDefaults,
  isMobileCameraQualityTier,
  normalizeMobileCameraQualityTier,
} from "../src/voice/mobile-video-quality";

it("applies the channel audio bitrate without dropping camera publish defaults", () => {
  const publishDefaults = applyMobileVoiceAudioBitrate(
    { simulcast: true, videoCodec: "h264" },
    128_000,
  );

  assert.equal(publishDefaults.audioPreset?.maxBitrate, 128_000);
  assert.equal(publishDefaults.simulcast, true);
  assert.equal(publishDefaults.videoCodec, "h264");
});

type PublishCall = {
  enabled: boolean;
  options?: VideoCaptureOptions | undefined;
  publishOptions?: TrackPublishOptions | undefined;
};

function createCameraTarget(failures: number) {
  const calls: PublishCall[] = [];
  let remainingFailures = failures;

  return {
    calls,
    setCameraEnabled(
      enabled: boolean,
      options?: VideoCaptureOptions,
      publishOptions?: TrackPublishOptions,
    ) {
      calls.push({ enabled, options, publishOptions });

      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return Promise.reject(new Error("h264 encoder unavailable"));
      }

      return Promise.resolve(undefined);
    },
  };
}

describe("mobile camera video quality contract", () => {
  it("publishes hardware H.264 with an explicit encoder budget per tier", () => {
    assert.equal(MOBILE_CAMERA_VIDEO_CODEC, "h264");
    assert.equal(DEFAULT_MOBILE_CAMERA_QUALITY_TIER, "h720");

    const standard = getMobileCameraPublishOptions("h720");
    assert.equal(standard.videoCodec, "h264");
    assert.equal(standard.degradationPreference, "maintain-framerate");
    assert.equal(standard.source, Track.Source.Camera);
    assert.deepEqual(standard.videoEncoding, { maxBitrate: 2_500_000, maxFramerate: 30 });

    const high = getMobileCameraPublishOptions("h1080");
    assert.deepEqual(high.videoEncoding, { maxBitrate: 3_500_000, maxFramerate: 30 });
  });

  it("beats the livekit default 1.7 Mbps VP8 camera publication", () => {
    const previousDefaultMaxBitrate = 1_700_000;

    assert.ok(getMobileCameraEncoding("h720").maxBitrate > previousDefaultMaxBitrate);
    assert.ok(getMobileCameraEncoding("h1080").maxBitrate > previousDefaultMaxBitrate);
  });

  it("publishes two simulcast layers so the phone encoder is not tripled", () => {
    const publishOptions = getMobileCameraPublishOptions();

    assert.equal(publishOptions.simulcast, true);
    assert.deepEqual(publishOptions.videoSimulcastLayers, [VideoPresets.h360]);
    assert.equal(publishOptions.videoSimulcastLayers?.length, 1);
  });

  it("never offers a backup codec, because H.264 cannot regress to one", () => {
    assert.equal(getMobileCameraPublishOptions().backupCodec, false);
    assert.equal(MOBILE_CAMERA_FALLBACK_CODEC, "vp8");
  });

  it("captures plain resolutions with no aspect-ratio constraint", () => {
    const captureOptions = buildMobileCameraCaptureOptions("user", "h1080");

    assert.deepEqual(captureOptions, {
      facingMode: "user",
      frameRate: 30,
      resolution: { frameRate: 30, height: 1080, width: 1920 },
    });
    assert.equal(Object.hasOwn(captureOptions.resolution ?? {}, "aspectRatio"), false);
    assert.equal(Object.hasOwn(captureOptions, "aspectRatio"), false);
    assert.deepEqual(getMobileCameraResolution("h720"), {
      frameRate: 30,
      height: 720,
      width: 1280,
    });
  });

  it("carries the whole camera contract in the room-wide publish defaults", () => {
    const roomDefaults = getMobileCameraRoomDefaults("environment");

    assert.deepEqual(roomDefaults.publishDefaults, {
      backupCodec: false,
      degradationPreference: "maintain-framerate",
      simulcast: true,
      videoCodec: "h264",
      videoEncoding: getMobileCameraEncoding(DEFAULT_MOBILE_CAMERA_QUALITY_TIER),
      videoSimulcastLayers: [VideoPresets.h360],
    });
    assert.deepEqual(
      getMobileCameraRoomPublishDefaults("h1080").videoEncoding,
      getMobileCameraEncoding("h1080"),
    );
    assert.deepEqual(
      roomDefaults.videoCaptureDefaults,
      buildMobileCameraCaptureOptions("environment", DEFAULT_MOBILE_CAMERA_QUALITY_TIER),
    );
  });

  it("keeps the room defaults a pure safety net for the per-publish options", () => {
    const publishOptions = getMobileCameraPublishOptions("h1080");

    for (const [key, value] of Object.entries(getMobileCameraRoomPublishDefaults("h1080"))) {
      assert.deepEqual(
        publishOptions[key as keyof typeof publishOptions],
        value,
        `getMobileCameraPublishOptions must restate ${key} with the same value`,
      );
    }

    assert.equal(publishOptions.source, Track.Source.Camera);
  });

  it("normalizes unknown tiers to the 720p default", () => {
    assert.equal(isMobileCameraQualityTier("h1080"), true);
    assert.equal(isMobileCameraQualityTier("h1440"), false);
    assert.equal(normalizeMobileCameraQualityTier("h1440"), "h720");
    assert.equal(normalizeMobileCameraQualityTier("h1080"), "h1080");
  });

  it("publishes H.264 with the full capture and publish contract", async () => {
    const target = createCameraTarget(0);

    const result = await enableMobileCameraWithCodecFallback(target, { facingMode: "user" });

    assert.equal(result.codec, "h264");
    assert.equal(target.calls.length, 1);
    assert.deepEqual(target.calls[0]?.options, buildMobileCameraCaptureOptions("user", "h720"));
    assert.equal(target.calls[0]?.publishOptions?.videoCodec, "h264");
    assert.deepEqual(target.calls[0]?.publishOptions?.videoEncoding, {
      maxBitrate: 2_500_000,
      maxFramerate: 30,
    });
  });

  it("retries once with VP8 when the H.264 encoder refuses", async () => {
    const target = createCameraTarget(1);

    const result = await enableMobileCameraWithCodecFallback(target, {
      facingMode: "environment",
      tier: "h1080",
    });

    assert.equal(result.codec, "vp8");
    assert.equal(target.calls.length, 2);
    assert.equal(target.calls[0]?.publishOptions?.videoCodec, "h264");
    assert.equal(target.calls[1]?.publishOptions?.videoCodec, "vp8");
    assert.deepEqual(
      target.calls[1]?.options,
      buildMobileCameraCaptureOptions("environment", "h1080"),
    );
    assert.deepEqual(target.calls[1]?.publishOptions?.videoEncoding, {
      maxBitrate: 3_500_000,
      maxFramerate: 30,
    });
  });

  it("stops after one retry instead of looping", async () => {
    const target = createCameraTarget(2);

    await assert.rejects(
      enableMobileCameraWithCodecFallback(target, { facingMode: "user" }),
      /h264 encoder unavailable/,
    );
    assert.equal(target.calls.length, 2);
  });
});

describe("mobile camera room defaults cannot silently reach a screen share", () => {
  const inertKeys: string[] = Object.keys(SCREEN_SHARE_INERT_MOBILE_CAMERA_ROOM_DEFAULT_KEYS);

  it("has no stale entry in the inert-key escape hatch", () => {
    const roomDefaultKeys = Object.keys(getMobileCameraRoomPublishDefaults());

    for (const key of inertKeys) {
      assert.ok(
        roomDefaultKeys.includes(key),
        `${key} is listed as inert but is not a room publish default`,
      );
    }
  });

  for (const tier of ["h720", "h1080"] as const) {
    for (const quality of MOBILE_SCREEN_SHARE_QUALITY_OPTIONS) {
      it(`restates every ${tier} room default in the ${quality.id} screen share publish options`, () => {
        const roomDefaults = getMobileCameraRoomPublishDefaults(tier);
        const screenShareOptions = getMobileScreenSharePublishOptions(quality.id);

        for (const key of Object.keys(roomDefaults)) {
          if (inertKeys.includes(key)) {
            assert.equal(
              Object.hasOwn(screenShareOptions, key),
              false,
              `${key} is documented as inert but the screen share options now set it — drop it from SCREEN_SHARE_INERT_MOBILE_CAMERA_ROOM_DEFAULT_KEYS`,
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
      ...getMobileCameraRoomPublishDefaults("h1080"),
      ...getMobileScreenSharePublishOptions(DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID),
    };

    assert.equal(merged.videoCodec, MOBILE_SCREEN_SHARE_VIDEO_CODEC);
    assert.equal(merged.degradationPreference, MOBILE_SCREEN_SHARE_DEGRADATION_PREFERENCE);
    assert.equal(merged.source, Track.Source.ScreenShare);
    assert.equal(merged.screenShareEncoding?.maxFramerate, 30);
    assert.equal(Object.hasOwn(merged, "scalabilityMode"), false);
  });
});
