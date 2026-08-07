import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VideoQuality } from "livekit-client";

import {
  MOBILE_CAMERA_TILE_FLOOR_DP,
  MOBILE_CAMERA_TILE_TARGET_SHORT_EDGE_PX,
  MOBILE_VOICE_ADAPTIVE_STREAM_SETTINGS,
  setVoiceVideoQualityCeiling,
  getMobileCameraTileMinWidth,
  getMobileVoiceRoomSubscriptionOptions,
  resolveVoiceVideoQuality,
} from "../src/voice/mobile-video-subscription";

function createPublication(overrides: { isSubscribed?: boolean } = {}) {
  const requested: VideoQuality[] = [];

  return {
    isSubscribed: overrides.isSubscribed ?? true,
    requested,
    setVideoQuality(quality: VideoQuality) {
      requested.push(quality);
    },
  };
}

describe("mobile voice subscription contract", () => {
  it("subscribes adaptively at the device pixel ratio in a channel room", () => {
    const options = getMobileVoiceRoomSubscriptionOptions({ sessionMode: "channel" });

    assert.deepEqual(options, {
      adaptiveStream: {
        pauseVideoInBackground: true,
        pixelDensity: "screen",
      },
      dynacast: true,
    });
    assert.equal(typeof options.adaptiveStream, "object");
    assert.notEqual(options.adaptiveStream, true as unknown as object);
  });

  it("turns adaptive stream off for a direct call, where it only costs sharpness", () => {
    const options = getMobileVoiceRoomSubscriptionOptions({ sessionMode: "direct" });

    assert.deepEqual(options, {
      adaptiveStream: false,
      dynacast: true,
    });
    assert.equal(options.adaptiveStream, false);
  });

  it("keeps dynacast on in both modes so publishers stop encoding dead layers", () => {
    assert.equal(getMobileVoiceRoomSubscriptionOptions({ sessionMode: "channel" }).dynacast, true);
    assert.equal(getMobileVoiceRoomSubscriptionOptions({ sessionMode: "direct" }).dynacast, true);
  });

  it("hands out a copy so a room cannot mutate the shared settings", () => {
    const options = getMobileVoiceRoomSubscriptionOptions({ sessionMode: "channel" });

    assert.notEqual(options.adaptiveStream, false);
    if (options.adaptiveStream !== false) {
      options.adaptiveStream.pixelDensity = 1;
    }

    assert.equal(MOBILE_VOICE_ADAPTIVE_STREAM_SETTINGS.pixelDensity, "screen");
    assert.deepEqual(
      getMobileVoiceRoomSubscriptionOptions({ sessionMode: "channel" }).adaptiveStream,
      {
        pauseVideoInBackground: true,
        pixelDensity: "screen",
      },
    );
  });

  it("asks for the top layer on a stage and caps a grid tile", () => {
    assert.equal(resolveVoiceVideoQuality({ isStage: true }), VideoQuality.HIGH);
    assert.equal(resolveVoiceVideoQuality({ isStage: false }), VideoQuality.MEDIUM);
  });

  it("pins a staged publication and releases it when the tile leaves the stage", () => {
    const publication = createPublication();

    assert.equal(setVoiceVideoQualityCeiling(publication, { isStage: true }), VideoQuality.HIGH);
    assert.equal(setVoiceVideoQualityCeiling(publication, { isStage: false }), VideoQuality.MEDIUM);
    assert.deepEqual(publication.requested, [VideoQuality.HIGH, VideoQuality.MEDIUM]);
  });

  it("stays silent when the participant turned their camera off", () => {
    assert.equal(setVoiceVideoQualityCeiling(undefined, { isStage: true }), null);
    assert.equal(setVoiceVideoQualityCeiling(null, { isStage: true }), null);
  });

  it("skips a local publication, which has no subscribed quality to set", () => {
    assert.equal(setVoiceVideoQualityCeiling({ isSubscribed: true }, { isStage: true }), null);
  });

  it("skips an unsubscribed publication instead of provoking a livekit warning", () => {
    const publication = createPublication({ isSubscribed: false });

    assert.equal(setVoiceVideoQualityCeiling(publication, { isStage: true }), null);
    assert.deepEqual(publication.requested, []);
  });

  it("sizes a camera tile from the device pixel ratio, never below the grid floor", () => {
    assert.equal(MOBILE_CAMERA_TILE_TARGET_SHORT_EDGE_PX, 360);
    assert.equal(MOBILE_CAMERA_TILE_FLOOR_DP, 148);

    // 3x phone: 120dp already covers the 360px layer, so the floor wins.
    assert.equal(getMobileCameraTileMinWidth(3), 148);
    // 2x phone: 180dp is needed before the tile stops asking below the ladder.
    assert.equal(getMobileCameraTileMinWidth(2), 180);
    assert.equal(getMobileCameraTileMinWidth(2.75), 148);
    assert.equal(getMobileCameraTileMinWidth(1), 360);
  });

  it("falls back to the grid floor for a nonsense pixel ratio", () => {
    assert.equal(getMobileCameraTileMinWidth(0), 148);
    assert.equal(getMobileCameraTileMinWidth(-2), 148);
    assert.equal(getMobileCameraTileMinWidth(Number.NaN), 148);
  });
});
