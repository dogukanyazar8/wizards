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
      /getScreenShareCaptureOptions\(\{\s*\.\.\.axes,\s*shareSystemAudio,\s*excludeSelfWindow: store\.screenShareExcludeSelfWindow,\s*allowSourceSwitch: store\.screenShareAllowSourceSwitch,/,
    );
  });

  it("tears the share down through the helper that covers both sources", () => {
    const sessionSource = readSource("lib/voice/screen-share-session.ts");
    assert.match(
      providerSource,
      /await measureVoicePerformance\(\s*\{ operation: "screen_share_stop_cleanup", runtime: "client" \},\s*\(\) => screenShareSession\.stop\(activeRoom\)/,
    );
    assert.match(sessionSource, /publication\.source === Track\.Source\.ScreenShareAudio/);
  });

  it("ends the share on the video track only, so losing audio keeps the picture", () => {
    const sessionSource = readSource("lib/voice/screen-share-session.ts");
    assert.match(sessionSource, /video\.mediaStreamTrack\.addEventListener\(/);
    assert.match(providerSource, /onEnded: \(\) => \{\s*void stopScreenShare\(activeRoom\);/);
  });

  it("suppresses local playback only when share audio was actually requested", () => {
    assert.match(
      providerSource,
      /if \(started && shareSystemAudio\) \{\s*\n\s*suppressLocalScreenShareAudioPlayback\(activeRoom\);/,
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
      /applyRemoteAudioState\(\s*activeRoom,\s*isDeafened,\s*participantVolumes,\s*DEFAULT_PARTICIPANT_VOLUME,\s*screenShareVolume,\s*masterOutputVolume,\s*\)/,
    );
    assert.match(
      providerSource,
      /\[isDeafened, participantVolumes, screenShareVolume, masterOutputVolume\]/,
    );
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
    assert.equal("settings.voice.screenShare.feature.noSystemAudio" in EN_MESSAGES, false);
  });

  it("can be turned on before the first share, from the settings window", () => {
    // The stage panel only exists while a share is running and the preference
    // only takes effect on the next share, so without this entry point the very
    // first share is always silent.
    //
    // K13 deleted `voice-preferences-panel.tsx`; the entry point is now the `e2` row of
    // Settings > Audio and Video > Screen share, and the bridge is what writes the store.
    const treeSource = readSource("lib/settings/tree.ts");
    const bridgeSource = readSource("components/settings/sections/av/av-settings-bridge.tsx");

    assert.match(treeSource, /key: "e2",\s+type: "toggle",/u);
    assert.match(
      bridgeSource,
      /case "e2":\s+writer\.setScreenShareAudioEnabled\(Boolean\(value\)\);/u,
      "the settings toggle must write the same store field the share path reads",
    );
    // The row must read back from the same field, or the toggle would show a stale state.
    assert.match(bridgeSource, /e2: state\.screenShareAudioEnabled,/);
  });
});
