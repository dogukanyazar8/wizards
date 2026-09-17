import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Track } from "livekit-client";

import {
  DEFAULT_SCREEN_SHARE_QUALITY_ID,
  SCREEN_SHARE_QUALITY_OPTIONS,
  getScreenShareCaptureOptions,
  getScreenShareQualityPreset,
  getScreenSharePublishOptions,
  isScreenShareAudioSupported,
} from "./screen-share";

function probe(constraints: Record<string, unknown> | (() => never)) {
  return {
    getDisplayMedia: () => undefined,
    getSupportedConstraints: typeof constraints === "function" ? constraints : () => constraints,
  };
}

describe("web screen share audio capture contract", () => {
  it("honors both behavior preferences independently with and without audio", () => {
    for (const excludeSelfWindow of [false, true]) {
      for (const allowSourceSwitch of [false, true]) {
        for (const shareSystemAudio of [false, true]) {
          const options = getScreenShareCaptureOptions("h1080fps60", {
            excludeSelfWindow,
            allowSourceSwitch,
            shareSystemAudio,
          });
          assert.equal(options.selfBrowserSurface, excludeSelfWindow ? "exclude" : "include");
          assert.equal(options.surfaceSwitching, allowSourceSwitch ? "include" : "exclude");
          assert.equal(options.audio, shareSystemAudio);
        }
      }
    }
  });
  it("captures video only until the sharer opts in", () => {
    const captureOptions = getScreenShareCaptureOptions("h1080fps60");

    assert.deepEqual(captureOptions, {
      audio: false,
      contentHint: "detail",
      resolution: getScreenShareQualityPreset("h1080fps60").resolution,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    });
    // The old single-argument call site must keep meaning exactly this.
    assert.deepEqual(
      getScreenShareCaptureOptions("h1080fps60", { shareSystemAudio: false }),
      captureOptions,
    );
  });

  it("asks for surface audio and stops local playback once the sharer opts in", () => {
    const captureOptions = getScreenShareCaptureOptions("h1080fps60", { shareSystemAudio: true });

    assert.deepEqual(captureOptions, {
      audio: true,
      contentHint: "detail",
      resolution: getScreenShareQualityPreset("h1080fps60").resolution,
      selfBrowserSurface: "exclude",
      suppressLocalAudioPlayback: true,
      surfaceSwitching: "include",
      systemAudio: "include",
    });
  });

  it("keeps the Whispr tab out of the picker in both modes", () => {
    for (const quality of SCREEN_SHARE_QUALITY_OPTIONS) {
      for (const shareSystemAudio of [false, true]) {
        const captureOptions = getScreenShareCaptureOptions(quality.id, { shareSystemAudio });

        assert.equal(captureOptions.selfBrowserSurface, "exclude");
        assert.equal(captureOptions.surfaceSwitching, "include");
        assert.equal(captureOptions.contentHint, "detail");
        assert.deepEqual(
          captureOptions.resolution,
          getScreenShareQualityPreset(quality.id).resolution,
        );
      }
    }
  });

  it("leaves the video publish contract untouched", () => {
    const publishOptions = getScreenSharePublishOptions(DEFAULT_SCREEN_SHARE_QUALITY_ID);

    assert.deepEqual(publishOptions, {
      backupCodec: true,
      degradationPreference: "maintain-resolution",
      scalabilityMode: "L3T3_KEY",
      screenShareEncoding: getScreenShareQualityPreset(DEFAULT_SCREEN_SHARE_QUALITY_ID).encoding,
      source: Track.Source.ScreenShare,
      videoCodec: "vp9",
    });
  });
});

describe("web screen share audio capability probe", () => {
  it("reports support when the browser knows the local-playback constraint", () => {
    assert.equal(isScreenShareAudioSupported(probe({ suppressLocalAudioPlayback: true })), true);
  });

  it("reports no support when the constraint is missing or false", () => {
    assert.equal(isScreenShareAudioSupported(probe({ displaySurface: true })), false);
    assert.equal(isScreenShareAudioSupported(probe({ suppressLocalAudioPlayback: false })), false);
  });

  it("reports no support without display capture at all", () => {
    assert.equal(
      isScreenShareAudioSupported({
        getSupportedConstraints: () => ({ suppressLocalAudioPlayback: true }),
      }),
      false,
    );
    assert.equal(
      isScreenShareAudioSupported({ getDisplayMedia: () => undefined }),
      false,
      "a browser that cannot report constraints cannot promise share audio",
    );
  });

  it("reports no support off the browser entirely", () => {
    assert.equal(isScreenShareAudioSupported(null), false);
    assert.equal(isScreenShareAudioSupported(undefined), false);
  });

  it("never lets a throwing probe block a share", () => {
    assert.equal(
      isScreenShareAudioSupported(
        probe(() => {
          throw new Error("constraint enumeration failed");
        }),
      ),
      false,
    );
  });
});

it("all independent axes use the shared bitrate ladder and preserve content intent", async () => {
  const types = await import("@wizards/types");
  const { getScreenSharePreset, resolveCapturedScreenShareResolution } =
    await import("./screen-share");
  for (const resolution of types.SCREEN_SHARE_RESOLUTIONS)
    for (const frameRate of types.SCREEN_SHARE_FRAME_RATES)
      for (const mode of types.SCREEN_SHARE_MODES) {
        const preset = getScreenSharePreset(resolution, frameRate, mode);
        assert.equal(
          preset.encoding.maxBitrate,
          types.getScreenShareBitrateKbps(mode, resolution, frameRate) * 1000,
        );
        assert.equal(
          getScreenShareCaptureOptions({ resolution, frameRate, mode }).contentHint,
          mode === "motion" ? "motion" : "detail",
        );
        const options = getScreenSharePublishOptions({
          preset,
          mode,
          codecChoice: { codec: "h264", hardware: true, reason: "hardware" },
        });
        assert.equal(options.backupCodec, false);
        assert.equal(
          options.degradationPreference,
          mode === "motion" ? "maintain-framerate" : "maintain-resolution",
        );
        assert.deepEqual(
          options.screenShareSimulcastLayers?.map((layer) => layer.height),
          [preset.height / 2, preset.height / 4],
        );
      }
  assert.equal(resolveCapturedScreenShareResolution("h2160", 1440), "h1440");
  assert.equal(resolveCapturedScreenShareResolution("h2160", 1080), "h1080");
});
