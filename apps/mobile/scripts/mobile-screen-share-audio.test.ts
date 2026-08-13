import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { Track } from "livekit-client";

import {
  applyMobileScreenShareAudioMute,
  syncMobileScreenShareAudioMute,
  resolveMobileScreenShareAudioVolume,
  type MobileScreenShareAudioRoom,
} from "../src/voice/mobile-screen-share-audio";

type VolumeCall = {
  readonly identity: string;
  readonly source: string | undefined;
  readonly volume: number;
};

function createRoom(
  calls: VolumeCall[],
  identities: readonly { readonly identity: string; readonly throws?: boolean }[],
  options: { readonly withoutSetVolume?: string } = {},
): MobileScreenShareAudioRoom {
  return {
    remoteParticipants: new Map(
      identities.map(({ identity, throws }) => [
        identity,
        {
          identity,
          ...(identity === options.withoutSetVolume
            ? {}
            : {
                setVolume(volume: number, source?: Track.Source.ScreenShareAudio) {
                  if (throws) {
                    throw new Error("participant is gone");
                  }

                  calls.push({ identity, source, volume });
                },
              }),
        },
      ]),
    ),
  };
}

describe("mobile screen share audio mute", () => {
  it("skips native volume writes until the mute choice or participant set changes", () => {
    const calls: VolumeCall[] = [];
    const room = createRoom(calls, [{ identity: "ada" }]);

    let signature: string | null = null;
    signature = syncMobileScreenShareAudioMute(room, true, signature);
    signature = syncMobileScreenShareAudioMute(room, true, signature);
    assert.equal(calls.length, 1);

    signature = syncMobileScreenShareAudioMute(
      createRoom(calls, [{ identity: "ada" }, { identity: "grace" }]),
      true,
      signature,
    );
    assert.equal(calls.length, 3);

    syncMobileScreenShareAudioMute(room, false, signature);
    assert.equal(calls.at(-1)?.volume, 1);
  });

  it("mutes and unmutes on livekit's own gain scale", () => {
    assert.equal(resolveMobileScreenShareAudioVolume(true), 0);
    assert.equal(resolveMobileScreenShareAudioVolume(false), 1);
  });

  it("only ever names the screen-share audio source, so the picture keeps running", () => {
    const calls: VolumeCall[] = [];
    const room = createRoom(calls, [{ identity: "ada" }, { identity: "grace" }]);

    assert.deepEqual(applyMobileScreenShareAudioMute(room, true), ["ada", "grace"]);
    assert.deepEqual(calls, [
      { identity: "ada", source: Track.Source.ScreenShareAudio, volume: 0 },
      { identity: "grace", source: Track.Source.ScreenShareAudio, volume: 0 },
    ]);
    assert.equal(
      calls.some((call) => call.source !== Track.Source.ScreenShareAudio),
      false,
      "the microphone mix and the video publication must never be named here",
    );
  });

  it("restores full gain when the listener unmutes", () => {
    const calls: VolumeCall[] = [];
    const room = createRoom(calls, [{ identity: "ada" }]);

    applyMobileScreenShareAudioMute(room, true);
    applyMobileScreenShareAudioMute(room, false);

    assert.deepEqual(
      calls.map((call) => call.volume),
      [0, 1],
    );
  });

  it("re-applies cleanly, which is how a reconnect keeps the choice", () => {
    const calls: VolumeCall[] = [];
    const room = createRoom(calls, [{ identity: "ada" }]);

    applyMobileScreenShareAudioMute(room, true);
    applyMobileScreenShareAudioMute(room, true);

    assert.deepEqual(calls, [
      { identity: "ada", source: Track.Source.ScreenShareAudio, volume: 0 },
      { identity: "ada", source: Track.Source.ScreenShareAudio, volume: 0 },
    ]);
  });

  it("skips a participant with no volume control instead of throwing", () => {
    const calls: VolumeCall[] = [];
    const room = createRoom(calls, [{ identity: "ada" }, { identity: "grace" }], {
      withoutSetVolume: "ada",
    });

    assert.deepEqual(applyMobileScreenShareAudioMute(room, true), ["grace"]);
  });

  it("keeps muting the rest when one participant throws", () => {
    const calls: VolumeCall[] = [];
    const room = createRoom(calls, [{ identity: "ada", throws: true }, { identity: "grace" }]);

    assert.deepEqual(applyMobileScreenShareAudioMute(room, true), ["grace"]);
    assert.deepEqual(calls, [
      { identity: "grace", source: Track.Source.ScreenShareAudio, volume: 0 },
    ]);
  });

  it("does nothing without a room", () => {
    assert.deepEqual(applyMobileScreenShareAudioMute(null, true), []);
    assert.deepEqual(applyMobileScreenShareAudioMute(undefined, true), []);
    assert.deepEqual(applyMobileScreenShareAudioMute({}, true), []);
  });
});

describe("mobile screen share audio wiring", () => {
  const hookSource = readFileSync(
    resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
    "utf8",
  );
  const screenSource = readFileSync(
    resolve(__dirname, "../src/app/screens/voice-screen.tsx"),
    "utf8",
  );

  it("synchronizes mute through a participant-set signature instead of every level tick", () => {
    const syncIndex = hookSource.indexOf("const updateParticipantsFromRoom = useCallback(");
    const applyIndex = hookSource.indexOf("syncMobileScreenShareAudioMute(");

    assert.ok(syncIndex > 0, "the participant sync must still exist");
    assert.ok(applyIndex > syncIndex, "the mute must be re-applied inside the participant sync");
    assert.match(hookSource, /syncMobileScreenShareAudioMute\(/);
  });

  it("stores the choice with the device preferences so it outlives the call", () => {
    assert.match(hookSource, /screenShareAudioMuted: muted,/);
    assert.match(hookSource, /selectScreenShareAudioMuted,/);
  });

  it("never lets the mute reach video or the microphone mix", () => {
    // Comments explain why the other mechanisms are avoided, so only the code
    // that actually runs is inspected.
    const moduleCode = readFileSync(
      resolve(__dirname, "../src/voice/mobile-screen-share-audio.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    assert.equal(
      moduleCode
        .match(/Track\.Source\.\w+/g)
        ?.every((source) => source.endsWith("ScreenShareAudio")),
      true,
      "ScreenShareAudio is the only source this rule may name",
    );
    assert.doesNotMatch(moduleCode, /setEnabled|setSubscribed/);
  });

  it("puts one mute switch on both share surfaces and no slider", () => {
    assert.equal(
      screenSource.match(/testID="mobile-voice-screen-share-audio-toggle"/g)?.length,
      1,
      "one shared button component, rendered by both surfaces",
    );
    assert.match(screenSource, /<ScreenShareAudioMuteButton[\s\S]{0,160}tone="fullscreen"/);
    assert.match(screenSource, /<ScreenShareAudioMuteButton[\s\S]{0,160}tone="inline"/);
    assert.doesNotMatch(screenSource, /screenShareAudioVolume|shareAudioSlider/);
  });
});
