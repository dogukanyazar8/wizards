import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Paths are relative to `src`, resolved from this file so the cwd never matters. */
function readSource(relativePath: string) {
  return readFileSync(resolve(SRC_ROOT, relativePath), "utf8");
}

describe("screen share audio wiring", () => {
  const providerSource = readSource("components/providers/live-voice-provider.tsx");

  it("only asks for share audio when the preference and the browser both allow it", () => {
    assert.match(
      providerSource,
      /const shareSystemAudio =\s*\n?\s*useVoiceStore\.getState\(\)\.screenShareAudioEnabled && isScreenShareAudioSupported\(\);/,
    );
    assert.match(
      providerSource,
      /getScreenShareCaptureOptions\(currentQuality, \{ shareSystemAudio \}\)/,
    );
  });

  it("tears the share down through the helper that covers both sources", () => {
    assert.match(
      providerSource,
      /const localScreenTracks = getLocalScreenShareTracks\(activeRoom\)/,
    );
    assert.doesNotMatch(
      providerSource,
      /publication\.source === Track\.Source\.ScreenShare\b(?![\s\S]{0,120}ScreenShareAudio)/,
      "stop must never filter screen share publications by video source alone",
    );
  });

  it("ends the share on the video track only, so losing audio keeps the picture", () => {
    const endedListenerIndex = providerSource.indexOf(
      "localScreenTrack.mediaStreamTrack.addEventListener",
    );
    const videoGuardIndex = providerSource.indexOf("localScreenTrack instanceof LocalVideoTrack");

    assert.ok(videoGuardIndex > 0 && endedListenerIndex > videoGuardIndex);
    assert.doesNotMatch(
      providerSource,
      /ScreenShareAudio[\s\S]{0,200}addEventListener\(\s*"ended"/,
    );
  });

  it("suppresses local playback only when share audio was actually requested", () => {
    assert.match(
      providerSource,
      /if \(shareSystemAudio\) \{\s*\n\s*suppressLocalScreenShareAudioPlayback\(activeRoom\);/,
    );
  });
});

describe("screen share audio preference storage", () => {
  const storeSource = readSource("store/voice-store.ts");

  it("persists the listener's share-audio ceiling next to the opt-in", () => {
    assert.match(storeSource, /screenShareVolume: DEFAULT_SCREEN_SHARE_VOLUME,/);
    assert.match(
      storeSource,
      /screenShareVolume: sanitizeScreenShareVolume\(persistedState\.screenShareVolume\),/,
    );
    assert.match(storeSource, /screenShareVolume: state\.screenShareVolume,/);
  });

  it("defaults to off and persists across reloads", () => {
    assert.match(storeSource, /screenShareAudioEnabled: false,/);
    assert.match(
      storeSource,
      /screenShareAudioEnabled: persistedState\.screenShareAudioEnabled === true,/,
      "a non-boolean persisted value must fall back to off, never to on",
    );
    assert.match(storeSource, /screenShareAudioEnabled: state\.screenShareAudioEnabled,/);
  });
});

describe("screen share audio control", () => {
  const stageSource = readSource("components/voice/room/voice-room-primitives.tsx");

  it("hides the toggle when the browser cannot capture share audio", () => {
    assert.match(stageSource, /hasShareAudioSupport && onToggleShareAudio \? \(/);
    assert.match(stageSource, /getServerScreenShareAudioSupportSnapshot = \(\) => false/);
    assert.match(stageSource, /data-testid="screen-share-audio-toggle"/);
  });

  it("keeps the quality select untouched next to it", () => {
    assert.match(stageSource, /data-testid="screen-share-quality-select"/);
    assert.ok(
      stageSource.indexOf('data-testid="screen-share-quality-select"') <
        stageSource.indexOf('data-testid="screen-share-audio-toggle"'),
    );
  });

  it("gives a listener the share-audio slider only on someone else's share", () => {
    assert.match(stageSource, /activeShare && !activeShare\.isLocal && onSetShareVolume \? \(/);
    assert.match(stageSource, /data-testid="screen-share-audio-volume"/);
    assert.match(stageSource, /data-testid="screen-share-audio-volume-reset"/);
  });

  it("feeds the listener ceiling into the volume sync, deafen included", () => {
    const providerSource = readSource("components/providers/live-voice-provider.tsx");

    assert.match(
      providerSource,
      /applyRemoteAudioState\(\s*activeRoom,\s*isDeafened,\s*participantVolumes,\s*DEFAULT_PARTICIPANT_VOLUME,\s*screenShareVolume,\s*\)/,
    );
    assert.match(providerSource, /\[isDeafened, participantVolumes, screenShareVolume\]/);
  });

  it("tells both locales that the surface audio is shared with everyone", () => {
    for (const messages of [EN_MESSAGES, TR_MESSAGES] as Array<Record<string, string>>) {
      assert.equal(typeof messages["voice.screenShare.audio.title"], "string");
      assert.equal(typeof messages["voice.screenShare.audio.volume"], "string");
      assert.equal(typeof messages["voice.screenShare.audio.resetVolume"], "string");
      assert.equal(typeof messages["voice.screenShare.audio.volumeDescription"], "string");

      const description = messages["voice.screenShare.audio.description"] ?? "";
      assert.ok(description.length > 40, "the privacy line must actually explain what is shared");
    }

    assert.notEqual(
      EN_MESSAGES["voice.screenShare.audio.description"],
      TR_MESSAGES["voice.screenShare.audio.description"],
      "the Turkish copy must be translated, not copied",
    );
    // The old settings chip promised the opposite of what now ships.
    assert.doesNotMatch(EN_MESSAGES["settings.voice.screenShare.feature.noSystemAudio"], /^No /);
  });

  it("can be turned on before the first share, from the voice settings panel", () => {
    // The stage panel only exists while a share is running and the preference
    // only takes effect on the next share, so without this entry point the very
    // first share is always silent.
    const panelSource = readSource("components/voice/voice-preferences-panel.tsx");

    assert.match(panelSource, /data-testid="voice-screen-share-audio"/);
    assert.match(panelSource, /screenShareAudioSupported \? \(/);
    // Above the collapsed advanced disclosure: a toggle nobody opens is a
    // toggle nobody finds before their first share.
    assert.ok(
      panelSource.indexOf('data-testid="voice-screen-share-audio"') <
        panelSource.indexOf('data-testid="voice-advanced-controls"'),
    );
    assert.match(
      panelSource,
      /setScreenShareAudioEnabled\(!screenShareAudioEnabled\)/,
      "the settings toggle must write the same store field the share path reads",
    );
    assert.match(panelSource, /isScreenShareAudioSupported,\s*\n\s*getServerCapabilitySnapshot,/);
  });
});

describe("hidden-tab remote video rule", () => {
  const providerSource = readSource("components/providers/live-voice-provider.tsx");

  it("only runs for direct calls, where adaptive stream is off", () => {
    // Channel rooms keep adaptiveStream, so livekit's own pauseVideoInBackground
    // covers them; running both rules would fight over requestedDisabled.
    assert.match(
      providerSource,
      /if \(typeof document === "undefined" \|\| sessionMode !== "direct"\) \{/,
    );
    assert.match(providerSource, /document\.addEventListener\("visibilitychange"/);
    assert.match(providerSource, /document\.removeEventListener\("visibilitychange"/);
  });

  it("suspends on hidden and releases what it suspended on the way back", () => {
    assert.match(providerSource, /document\.visibilityState === "hidden"/);
    assert.match(providerSource, /suspendRemoteVideoForBackground\(activeRoom\)/);
    assert.match(
      providerSource,
      /resumeRemoteVideoFromBackground\(activeRoom, suspendedTrackSids\)/,
    );
  });

  it("covers a call joined in an already-hidden tab", () => {
    // visibilitychange never fires for a tab that was hidden the whole time, so
    // the rule sweeps once when it installs.
    const listenerIndex = providerSource.indexOf('document.addEventListener("visibilitychange"');
    const initialSweepIndex = providerSource.indexOf(
      "enforceHiddenTabRemoteVideo();",
      listenerIndex,
    );

    assert.ok(listenerIndex > 0 && initialSweepIndex > listenerIndex);
  });

  it("catches a track that subscribes while the tab is already hidden", () => {
    const syncIndex = providerSource.indexOf("const syncRoomParticipants = () => {");
    const enforceInSync = providerSource.indexOf("enforceHiddenTabRemoteVideo();", syncIndex);
    const syncEndIndex = providerSource.indexOf("Room participant sync failed", syncIndex);

    assert.ok(syncIndex > 0 && enforceInSync > syncIndex && enforceInSync < syncEndIndex);
  });

  it("costs a visible tab one property read, not a room walk", () => {
    assert.match(
      providerSource,
      /const enforceHiddenTabRemoteVideo = useCallback\(\(\) => \{\s*\n\s*if \(typeof document === "undefined" \|\| document\.visibilityState !== "hidden"\) \{/,
      "the hot path must bail out before reading the store or the room",
    );
  });

  it("never leaves a publication parked when the session ends", () => {
    const cleanupIndex = providerSource.indexOf('document.removeEventListener("visibilitychange"');
    const releaseAfterCleanup = providerSource.indexOf(
      "releaseHiddenTabRemoteVideo();",
      cleanupIndex,
    );

    assert.ok(cleanupIndex > 0 && releaseAfterCleanup > cleanupIndex);
  });
});
