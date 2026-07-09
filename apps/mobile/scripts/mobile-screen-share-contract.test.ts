import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { Track } from "livekit-client";
import { MobileVoiceHeartbeatRequestSchema } from "@wizards/types";

import {
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  MOBILE_SCREEN_SHARE_QUALITY_OPTIONS,
  getMobileScreenShareCaptureOptions,
  getMobileScreenSharePublishOptions,
  normalizeMobileScreenShareQualityId,
  validateMobileScreenShareQualityContract,
} from "../src/voice/mobile-screen-share";
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
    assert.match(serviceSource, /\.del\(screenShareKey\)/);
    assert.match(serviceSource, /emitVoiceScreenShareUpdate/);
  });

  it("keeps screen-share privacy copy explicit and errors redacted", () => {
    assert.match(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE, /entire screen/i);
    assert.match(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE, /notifications/i);
    assert.match(MOBILE_SCREEN_SHARE_PRIVACY_NOTICE, /other apps/i);
    assert.match(MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE, /stopped/i);
    assert.equal(isMobileScreenSharePermissionDenied(new Error("Permission denied")), true);
    assert.equal(
      redactMobileScreenShareError("bearer abc.def.ghi failed while capturing screen"),
      "Screen share failed without exposing sensitive details.",
    );
    assert.deepEqual(validateMobileScreenShareContract(), []);
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
