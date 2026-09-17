import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { Track } from "livekit-client";
import { MobileVoiceHeartbeatRequestSchema } from "@wizards/types";

import {
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  MOBILE_SCREEN_SHARE_DEGRADATION_PREFERENCE,
  MOBILE_SCREEN_SHARE_MAX_BITRATE,
  MOBILE_SCREEN_SHARE_QUALITY_OPTIONS,
  getMobileScreenShareCaptureOptions,
  getMobileScreenSharePublishOptions,
  getPreferredMobileScreenShareQualityId,
  normalizeMobileScreenShareQualityId,
  setPreferredMobileScreenShareQualityId,
  validateMobileScreenShareQualityContract,
} from "../src/voice/mobile-screen-share";
import { mobileCopy } from "../src/locale/mobile-copy";
import {
  MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE,
  MOBILE_SCREEN_SHARE_PRIVACY_NOTICE,
  buildMobileScreenShareHeartbeatPayload,
  getMobileVoiceScreenShareStateKey,
  isMobileScreenSharePermissionDenied,
  redactMobileScreenShareError,
  validateMobileScreenShareContract,
  VOICE_SCREEN_SHARE_STATE_TTL_SECONDS,
} from "../src/voice/mobile-screen-share-contract";

describe("mobile screen share contract", () => {
  it("uses mobile-safe LiveKit capture and publish options", () => {
    assert.equal(DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID, "h720fps30");
    assert.deepEqual(
      MOBILE_SCREEN_SHARE_QUALITY_OPTIONS.map((option) => option.id),
      ["h720fps30", "h1080fps30"],
    );
    assert.equal(normalizeMobileScreenShareQualityId("h1440fps60"), "h720fps30");

    const captureOptions = getMobileScreenShareCaptureOptions("h1080fps30");
    assert.equal(captureOptions.audio, false);
    assert.equal(captureOptions.contentHint, "detail");
    assert.equal(captureOptions.resolution?.width, 1920);
    assert.equal(captureOptions.resolution?.height, 1080);
    assert.equal(captureOptions.resolution?.frameRate, 30);

    const publishOptions = getMobileScreenSharePublishOptions("h1080fps30");
    assert.equal(publishOptions.source, Track.Source.ScreenShare);
    assert.equal(publishOptions.screenShareEncoding?.maxFramerate, 30);
    assert.equal(validateMobileScreenShareQualityContract().length, 0);
  });

  it("raises the mobile ceiling to 1080p30 at 4 Mbps on the hardware encoder", () => {
    assert.equal(MOBILE_SCREEN_SHARE_MAX_BITRATE, 4_000_000);

    const high = getMobileScreenSharePublishOptions("h1080fps30");
    assert.equal(high.screenShareEncoding?.maxBitrate, 4_000_000);
    assert.equal(high.videoCodec, "h264");
    // H.264 carries no SVC layers, so there is no backup codec to regress to.
    assert.equal(high.backupCodec, false);

    const standard = getMobileScreenSharePublishOptions("h720fps30");
    assert.equal(standard.screenShareEncoding?.maxBitrate, 2_000_000);
    assert.equal(standard.videoCodec, "h264");
  });

  it("holds resolution over framerate so shared text stays readable", () => {
    assert.equal(MOBILE_SCREEN_SHARE_DEGRADATION_PREFERENCE, "maintain-resolution");

    for (const option of MOBILE_SCREEN_SHARE_QUALITY_OPTIONS) {
      assert.equal(
        getMobileScreenSharePublishOptions(option.id).degradationPreference,
        "maintain-resolution",
      );
    }
  });

  it("publishes the quality the user chose, even when the call site passes nothing", () => {
    try {
      setPreferredMobileScreenShareQualityId("h1080fps30");

      assert.equal(getPreferredMobileScreenShareQualityId(), "h1080fps30");
      assert.equal(getMobileScreenShareCaptureOptions().resolution?.height, 1080);
      assert.equal(getMobileScreenSharePublishOptions().screenShareEncoding?.maxBitrate, 4_000_000);

      // A stored value the app no longer ships falls back to the safe default.
      setPreferredMobileScreenShareQualityId("h1440fps60");
      assert.equal(getPreferredMobileScreenShareQualityId(), "h720fps30");
      assert.equal(getMobileScreenShareCaptureOptions().resolution?.height, 720);
    } finally {
      setPreferredMobileScreenShareQualityId(DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID);
    }
  });

  it("hands the stored quality to the LiveKit publish call instead of dropping it", () => {
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );

    assert.match(hookSource, /voiceDevicePreferencesRef\.current\.screenShareQualityId/);
    assert.match(hookSource, /getMobileScreenShareCaptureOptions\(screenShareQualityId\)/);
    assert.match(hookSource, /getMobileScreenSharePublishOptions\(screenShareQualityId\)/);
    assert.match(hookSource, /setPreferredMobileScreenShareQualityId/);
  });

  it("exposes the quality picker on the settings sheet rather than leaving it dead code", () => {
    const sheetSource = readFileSync(
      resolve(__dirname, "../src/voice/mobile-voice-settings-sheet.tsx"),
      "utf8",
    );

    assert.match(sheetSource, /MOBILE_SCREEN_SHARE_QUALITY_OPTIONS/);
    assert.match(sheetSource, /mobile-voice-screen-share-quality-/);
    assert.match(sheetSource, /onSelectScreenShareQuality/);
  });

  it("shares the same presence key and heartbeat payload shape as web voice state", () => {
    assert.equal(VOICE_SCREEN_SHARE_STATE_TTL_SECONDS, 120);
    assert.equal(
      getMobileVoiceScreenShareStateKey("voice-1", "user-1"),
      "voice:screenshare:voice-1:user-1",
    );

    const payload = buildMobileScreenShareHeartbeatPayload({
      isScreenSharing: true,
      sessionId: "11111111-1111-4111-8111-111111111111",
    });

    assert.deepEqual(payload, {
      selfScreenShare: true,
      selfStream: true,
      sessionId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(MobileVoiceHeartbeatRequestSchema.parse(payload).selfScreenShare, true);
  });

  it("keeps web heartbeat responsible for the shared Redis screen-share presence state", () => {
    const serviceSource = readFileSync(
      resolve(__dirname, "../../web/src/lib/voice/service.ts"),
      "utf8",
    );
    const stateSource = readFileSync(
      resolve(__dirname, "../../web/src/lib/voice/screen-share-state.ts"),
      "utf8",
    );

    assert.match(stateSource, /VOICE_SCREEN_SHARE_STATE_TTL_SECONDS = 120/);
    assert.match(stateSource, /voice:screenshare:\$\{channelId\}:\$\{userId\}/);
    assert.match(serviceSource, /VOICE_SCREEN_SHARE_STATE_TTL_SECONDS/);
    assert.match(serviceSource, /selfScreenShare \?\? input\.selfStream/);
    assert.match(
      serviceSource,
      /\.set\(screenShareKey, "1", "EX", VOICE_SCREEN_SHARE_STATE_TTL_SECONDS\)/,
    );
    assert.match(serviceSource, /\.del\(screenShareKey, streamKey\)/);
    assert.match(serviceSource, /emitVoiceScreenShareUpdate/);
  });

  it("keeps screen-share privacy copy explicit and errors redacted", () => {
    assert.match(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE, /entire screen/i);
    assert.match(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE, /notifications/i);
    assert.match(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE, /other apps/i);
    // A phone cannot capture its own sound, so the sharer has to be told before
    // they assume the room hears the video they are playing.
    assert.match(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE, /audio is not shared/i);
    assert.match(MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE, /stopped/i);
    assert.equal(isMobileScreenSharePermissionDenied(new Error("Permission denied")), true);
    assert.equal(
      redactMobileScreenShareError("bearer abc.def.ghi failed while capturing screen"),
      "Screen share failed without exposing sensitive details.",
    );
    assert.deepEqual(validateMobileScreenShareContract(), []);
  });

  it("tells the sharer in both locales that a phone shares no audio", () => {
    for (const consentCopy of [
      mobileCopy.tr.voiceScreenShareConsentDescription,
      mobileCopy.en.voiceScreenShareConsentDescription,
    ]) {
      assert.ok(consentCopy.length > 40);
      assert.match(consentCopy, /ses|audio/i);
    }

    assert.match(mobileCopy.en.voiceScreenShareConsentDescription, /audio is not shared/i);
    assert.match(mobileCopy.tr.voiceScreenShareConsentDescription, /ses paylaşılmaz/i);
    assert.notEqual(
      mobileCopy.tr.voiceScreenShareConsentDescription,
      mobileCopy.en.voiceScreenShareConsentDescription,
      "the Turkish copy must be translated, not copied",
    );
  });

  it("keeps the mobile voice hook aligned with LiveKit screen share lifecycle", () => {
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );

    assert.match(hookSource, /toggleScreenShare/);
    assert.match(hookSource, /setScreenShareEnabled/);
    assert.match(hookSource, /getMobileScreenShareCaptureOptions/);
    assert.match(hookSource, /selfScreenShare/);
    assert.match(hookSource, /AppState\.addEventListener/);
  });

  it("renders subscribed mobile screen-share tracks with the LiveKit native video view", () => {
    const voiceScreenSource = readFileSync(
      resolve(__dirname, "../src/app/screens/voice-screen.tsx"),
      "utf8",
    );
    const roomContractSource = readFileSync(
      resolve(__dirname, "../src/voice/mobile-voice-room-contract.ts"),
      "utf8",
    );
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );

    assert.match(roomContractSource, /screenShareTrackRef/);
    assert.match(hookSource, /screenShareTrackRef/);
    assert.match(hookSource, /Track\.Source\.ScreenShare/);
    assert.match(voiceScreenSource, /VideoTrack/);
    assert.match(voiceScreenSource, /MobileScreenShareViewer/);
    assert.match(voiceScreenSource, /screenShareTrackRef/);
    assert.match(voiceScreenSource, /objectFit="contain"/);
  });
});
