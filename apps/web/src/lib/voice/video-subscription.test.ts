import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VideoQuality } from "livekit-client";

import {
  VOICE_ADAPTIVE_STREAM_SETTINGS,
  setVoiceVideoQualityCeiling,
  getVoiceRoomSubscriptionOptions,
  resolveVoiceVideoQuality,
} from "./video-subscription";

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

describe("web voice subscription contract", () => {
  it("subscribes adaptively at the screen's real pixel density in a channel room", () => {
    const options = getVoiceRoomSubscriptionOptions({ sessionMode: "channel" });

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
    const options = getVoiceRoomSubscriptionOptions({ sessionMode: "direct" });

    assert.deepEqual(options, {
      adaptiveStream: false,
      dynacast: true,
    });
    assert.equal(options.adaptiveStream, false);
  });

  it("keeps dynacast on in both modes so publishers stop encoding dead layers", () => {
    assert.equal(getVoiceRoomSubscriptionOptions({ sessionMode: "channel" }).dynacast, true);
    assert.equal(getVoiceRoomSubscriptionOptions({ sessionMode: "direct" }).dynacast, true);
  });

  it("hands out a copy so a room cannot mutate the shared settings", () => {
    const options = getVoiceRoomSubscriptionOptions({ sessionMode: "channel" });

    assert.notEqual(options.adaptiveStream, false);
    if (options.adaptiveStream !== false) {
      options.adaptiveStream.pixelDensity = 1;
    }

    assert.equal(VOICE_ADAPTIVE_STREAM_SETTINGS.pixelDensity, "screen");
    assert.deepEqual(getVoiceRoomSubscriptionOptions({ sessionMode: "channel" }).adaptiveStream, {
      pauseVideoInBackground: true,
      pixelDensity: "screen",
    });
  });

  it("asks for the top layer on a stage and caps a thumbnail", () => {
    assert.equal(resolveVoiceVideoQuality({ isStage: true }), VideoQuality.HIGH);
    assert.equal(resolveVoiceVideoQuality({ isStage: false }), VideoQuality.MEDIUM);
  });

  it("asks for the top layer on visible FULL-mode surfaces", () => {
    assert.equal(
      resolveVoiceVideoQuality({ isStage: false, videoQualityMode: "FULL" }),
      VideoQuality.HIGH,
    );
    assert.equal(
      resolveVoiceVideoQuality({
        isStage: false,
        isVisible: false,
        videoQualityMode: "FULL",
      }),
      VideoQuality.MEDIUM,
    );
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
    const localPublication = { isSubscribed: true };

    assert.equal(setVoiceVideoQualityCeiling(localPublication, { isStage: true }), null);
  });

  it("skips an unsubscribed publication instead of provoking a livekit warning", () => {
    const publication = createPublication({ isSubscribed: false });

    assert.equal(setVoiceVideoQualityCeiling(publication, { isStage: true }), null);
    assert.deepEqual(publication.requested, []);
  });
});
