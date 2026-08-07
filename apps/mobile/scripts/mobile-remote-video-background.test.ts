import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";

import { Track } from "livekit-client";

import {
  resumeRemoteVideoFromBackground,
  suspendRemoteVideoForBackground,
  type MobileBackgroundVideoPublication,
  type MobileBackgroundVideoRoom,
} from "../src/voice/mobile-remote-video-background";
import { shouldSuspendVoiceMediaOnAppStateChange } from "../src/voice/mobile-voice-background-media";

type EnabledCall = { readonly enabled: boolean; readonly trackSid: string };

function createPublication(
  calls: EnabledCall[],
  input: {
    readonly isEnabled?: boolean;
    readonly isSubscribed?: boolean;
    readonly kind?: string;
    readonly local?: boolean;
    readonly trackSid: string;
  },
): MobileBackgroundVideoPublication {
  const publication: {
    isEnabled?: boolean;
    isSubscribed?: boolean;
    kind?: string;
    trackSid: string;
    setEnabled?: (enabled: boolean) => void;
  } = {
    isEnabled: input.isEnabled ?? true,
    isSubscribed: input.isSubscribed ?? true,
    kind: input.kind ?? Track.Kind.Video,
    trackSid: input.trackSid,
  };

  if (!input.local) {
    publication.setEnabled = (enabled: boolean) => {
      calls.push({ enabled, trackSid: input.trackSid });
      publication.isEnabled = enabled;
    };
  }

  return publication;
}

function createRoom(
  participants: readonly (readonly MobileBackgroundVideoPublication[])[],
): MobileBackgroundVideoRoom {
  return {
    remoteParticipants: new Map(
      participants.map((publications, index) => [
        `participant-${index}`,
        {
          trackPublications: new Map(
            publications.map((publication) => [publication.trackSid ?? "", publication]),
          ),
        },
      ]),
    ),
  };
}

describe("mobile remote video background rule", () => {
  it("disables every remote video publication and leaves audio alone", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([
      [
        createPublication(calls, { trackSid: "camera-a" }),
        createPublication(calls, { kind: Track.Kind.Audio, trackSid: "mic-a" }),
      ],
      [
        createPublication(calls, { trackSid: "screen-b" }),
        createPublication(calls, { kind: Track.Kind.Audio, trackSid: "mic-b" }),
      ],
    ]);

    const suspended = suspendRemoteVideoForBackground(room);

    assert.deepEqual(suspended, ["camera-a", "screen-b"]);
    assert.deepEqual(calls, [
      { enabled: false, trackSid: "camera-a" },
      { enabled: false, trackSid: "screen-b" },
    ]);
    assert.equal(
      calls.some((call) => call.trackSid.startsWith("mic-")),
      false,
    );
  });

  it("treats a screen share as video, so it pauses with the cameras", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([[createPublication(calls, { trackSid: "screen-a" })]]);

    assert.deepEqual(suspendRemoteVideoForBackground(room), ["screen-a"]);
  });

  it("skips a publication that is already disabled, so it is never ours to resume", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([
      [
        createPublication(calls, { isEnabled: false, trackSid: "user-paused" }),
        createPublication(calls, { trackSid: "camera-a" }),
      ],
    ]);

    const suspended = suspendRemoteVideoForBackground(room);

    assert.deepEqual(suspended, ["camera-a"]);
    assert.deepEqual(calls, [{ enabled: false, trackSid: "camera-a" }]);

    resumeRemoteVideoFromBackground(room, suspended);

    assert.deepEqual(calls, [
      { enabled: false, trackSid: "camera-a" },
      { enabled: true, trackSid: "camera-a" },
    ]);
  });

  it("silently skips a local publication, which carries no setEnabled", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([
      [
        createPublication(calls, { local: true, trackSid: "local-camera" }),
        createPublication(calls, { trackSid: "camera-a" }),
      ],
    ]);

    assert.deepEqual(suspendRemoteVideoForBackground(room), ["camera-a"]);
    assert.deepEqual(resumeRemoteVideoFromBackground(room, ["local-camera", "camera-a"]), [
      "camera-a",
    ]);
  });

  it("skips an unsubscribed publication instead of making livekit warn", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([
      [createPublication(calls, { isSubscribed: false, trackSid: "unsubscribed" })],
    ]);

    assert.deepEqual(suspendRemoteVideoForBackground(room), []);
    assert.deepEqual(calls, []);
  });

  it("resumes only the sids it suspended", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([
      [
        createPublication(calls, { trackSid: "camera-a" }),
        createPublication(calls, { isEnabled: false, trackSid: "someone-elses" }),
      ],
    ]);

    const suspended = suspendRemoteVideoForBackground(room);
    calls.length = 0;

    const resumed = resumeRemoteVideoFromBackground(room, suspended);

    assert.deepEqual(resumed, ["camera-a"]);
    assert.deepEqual(calls, [{ enabled: true, trackSid: "camera-a" }]);
  });

  it("drops a sid that left the room while the app was away", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([
      [createPublication(calls, { isEnabled: false, trackSid: "camera-a" })],
    ]);

    const resumed = resumeRemoteVideoFromBackground(room, ["camera-a", "participant-left"]);

    assert.deepEqual(resumed, ["camera-a"]);
    assert.deepEqual(calls, [{ enabled: true, trackSid: "camera-a" }]);
  });

  it("does nothing on an empty room, a missing room or an empty resume set", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([[createPublication(calls, { trackSid: "camera-a" })]]);

    assert.deepEqual(suspendRemoteVideoForBackground(null), []);
    assert.deepEqual(suspendRemoteVideoForBackground(undefined), []);
    assert.deepEqual(suspendRemoteVideoForBackground({}), []);
    assert.deepEqual(resumeRemoteVideoFromBackground(room, []), []);
    assert.deepEqual(resumeRemoteVideoFromBackground(room, null), []);
    assert.deepEqual(resumeRemoteVideoFromBackground(null, ["camera-a"]), []);
    assert.deepEqual(calls, []);
  });

  it("survives two backgrounds in a row without losing the suspended set", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([
      [
        createPublication(calls, { trackSid: "camera-a" }),
        createPublication(calls, { trackSid: "camera-b" }),
      ],
    ]);
    const suspendedSids = new Set<string>();

    for (const trackSid of suspendRemoteVideoForBackground(room)) {
      suspendedSids.add(trackSid);
    }
    for (const trackSid of suspendRemoteVideoForBackground(room)) {
      suspendedSids.add(trackSid);
    }

    assert.deepEqual([...suspendedSids], ["camera-a", "camera-b"]);
    assert.equal(calls.length, 2);

    const resumed = resumeRemoteVideoFromBackground(room, suspendedSids);

    assert.deepEqual(resumed, ["camera-a", "camera-b"]);
    assert.equal(calls.length, 4);
  });

  it("pauses nothing while a capture-consent dialog holds the app in the background", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([[createPublication(calls, { trackSid: "camera-a" })]]);

    // Same single rule the local-media teardown uses: no second definition of
    // "the app really went to the background".
    const shouldSuspend = shouldSuspendVoiceMediaOnAppStateChange({
      captureConsentInProgress: true,
      nextAppState: "background",
    });

    if (shouldSuspend) {
      suspendRemoteVideoForBackground(room);
    }

    assert.equal(shouldSuspend, false);
    assert.deepEqual(calls, []);
  });
});

type ServerTrackUpdate = { readonly disabled: boolean; readonly trackSid: string };

/**
 * Models livekit's real `RemoteTrackPublication` bookkeeping: `setEnabled`
 * writes `requestedDisabled`, `isEnabled` prefers it over adaptive stream's
 * `visible`, and every settings change re-sends `disabled: !isEnabled` upstream.
 */
function createLiveKitLikePublication(
  serverUpdates: ServerTrackUpdate[],
  input: { readonly trackSid: string; readonly visible?: boolean },
) {
  const publication = {
    kind: Track.Kind.Video as string,
    isSubscribed: true,
    requestedDisabled: undefined as boolean | undefined,
    trackSid: input.trackSid,
    visible: input.visible ?? true,
    get isEnabled(): boolean {
      return this.requestedDisabled !== undefined ? !this.requestedDisabled : this.visible;
    },
    emitTrackUpdate() {
      serverUpdates.push({ disabled: !this.isEnabled, trackSid: input.trackSid });
    },
    setEnabled(enabled: boolean) {
      if (this.requestedDisabled === !enabled) {
        return;
      }
      this.requestedDisabled = !enabled;
      this.emitTrackUpdate();
    },
  };

  return publication;
}

describe("mobile remote video background hands adaptive stream back", () => {
  it("clears livekit's requestedDisabled instead of pinning the track enabled", () => {
    const serverUpdates: ServerTrackUpdate[] = [];
    const publication = createLiveKitLikePublication(serverUpdates, { trackSid: "camera-a" });
    const room = createRoom([[publication]]);

    const suspended = suspendRemoteVideoForBackground(room);

    assert.deepEqual(suspended, ["camera-a"]);
    assert.equal(publication.requestedDisabled, true);
    assert.deepEqual(serverUpdates, [{ disabled: true, trackSid: "camera-a" }]);

    resumeRemoteVideoFromBackground(room, suspended);

    assert.equal(publication.requestedDisabled, undefined);
    assert.equal(publication.isEnabled, true);
    assert.deepEqual(serverUpdates, [
      { disabled: true, trackSid: "camera-a" },
      { disabled: false, trackSid: "camera-a" },
    ]);
  });

  it("lets the viewport decide again: a tile that scrolled off stays paused", () => {
    const serverUpdates: ServerTrackUpdate[] = [];
    const publication = createLiveKitLikePublication(serverUpdates, { trackSid: "camera-a" });
    const room = createRoom([[publication]]);

    const suspended = suspendRemoteVideoForBackground(room);
    // Adaptive stream's viewport detector moved the tile off screen meanwhile.
    publication.visible = false;

    resumeRemoteVideoFromBackground(room, suspended);

    assert.equal(publication.requestedDisabled, undefined);
    assert.equal(publication.isEnabled, false);
    assert.deepEqual(serverUpdates.at(-1), { disabled: true, trackSid: "camera-a" });

    // And once the tile scrolls back, adaptive stream alone re-enables it.
    publication.visible = true;
    assert.equal(publication.isEnabled, true);
  });

  it("keeps a second background cycle working after the handback", () => {
    const serverUpdates: ServerTrackUpdate[] = [];
    const publication = createLiveKitLikePublication(serverUpdates, { trackSid: "camera-a" });
    const room = createRoom([[publication]]);

    resumeRemoteVideoFromBackground(room, suspendRemoteVideoForBackground(room));
    const secondSuspend = suspendRemoteVideoForBackground(room);

    assert.deepEqual(secondSuspend, ["camera-a"]);
    assert.equal(publication.isEnabled, false);
    assert.deepEqual(serverUpdates.at(-1), { disabled: true, trackSid: "camera-a" });
  });

  it("falls back to setEnabled(true) when the livekit internals are gone", () => {
    const calls: EnabledCall[] = [];
    const room = createRoom([[createPublication(calls, { trackSid: "camera-a" })]]);

    const resumed = resumeRemoteVideoFromBackground(room, suspendRemoteVideoForBackground(room));

    assert.deepEqual(resumed, ["camera-a"]);
    assert.deepEqual(calls, [
      { enabled: false, trackSid: "camera-a" },
      { enabled: true, trackSid: "camera-a" },
    ]);
  });

  it("still matches the livekit-client build this handback reads", () => {
    const publicationTypes = readFileSync(
      resolve(
        dirname(require.resolve("livekit-client")),
        "src/room/track/RemoteTrackPublication.d.ts",
      ),
      "utf8",
    );

    assert.match(publicationTypes, /protected requestedDisabled: boolean \| undefined;/);
    assert.match(publicationTypes, /protected visible: boolean;/);
    assert.match(publicationTypes, /emitTrackUpdate\(\): void;/);
    assert.match(publicationTypes, /get isEnabled\(\): boolean;/);
  });
});

describe("mobile voice hook remote-video background wiring", () => {
  const hookSource = readFileSync(
    resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
    "utf8",
  );

  it("suspends remote video only behind the shared capture-consent guard", () => {
    const guardIndex = hookSource.indexOf("shouldSuspendVoiceMediaOnAppStateChange({");
    const suspendIndex = hookSource.indexOf("suspendRemoteVideoForBackground(room)");

    assert.ok(guardIndex > 0, "hook must consult the shared background rule");
    assert.ok(suspendIndex > guardIndex, "remote video must pause after the consent guard");
    assert.match(
      hookSource,
      /resumeRemoteVideoFromBackground\(activeRoom, suspendedRemoteVideoSids\)/,
    );
  });

  it("clears the suspended-sid set whenever the room changes or goes away", () => {
    const clearCount =
      hookSource.split("backgroundSuspendedRemoteVideoSidsRef.current.clear()").length - 1;

    // join, leaveVoiceChannel, cleanupDisconnectedRoom, unmount.
    assert.equal(clearCount, 4);
  });

  it("leaves the local camera and screen share teardown in place", () => {
    assert.match(hookSource, /setCameraEnabled\(false\)/);
    assert.match(hookSource, /setScreenShareEnabled\(false\)/);
    assert.match(hookSource, /MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE/);
    assert.match(
      hookSource,
      /pushToTalkController\s*\n?\s*\.cancel\(\{ closeMicrophone: true \}\)/,
    );
  });
});
