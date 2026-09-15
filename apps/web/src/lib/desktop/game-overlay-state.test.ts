import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VoiceMiniSnapshot } from "@wizards/types";
import {
  WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT,
  WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT,
} from "./runtime";
import { subscribeVoiceMiniSnapshots } from "./voice-mini-snapshots";
import {
  getVisibleGameOverlayParticipants,
  subscribeGameOverlaySnapshots,
  isDesktopGameOverlayOperationInFlight,
  transitionDesktopGameOverlayState,
} from "@/lib/desktop/game-overlay-state";

const snapshot: VoiceMiniSnapshot = {
  active: true,
  connection: { quality: "good", rttMs: 42 },
  overlay: { anchor: "top-left", size: "normal", speakingOnly: false },
  participants: [
    {
      userId: "local-user",
      displayName: "Ada",
      avatarUrl: null,
      isSpeaking: false,
      isMuted: false,
      isDeafened: false,
      isLocal: true,
      audioLevel: 0,
    },
  ],
  updatedAt: "2026-09-15T12:00:00.000Z",
  version: 1,
};

for (const [eventName, subscribe] of [
  [WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT, subscribeGameOverlaySnapshots],
  [WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT, subscribeVoiceMiniSnapshots],
] as const) {
  describe(`desktop first snapshot: ${eventName}`, () => {
    it("replays a native snapshot published before React mounted, then unsubscribes", () => {
      const target = Object.assign(new EventTarget(), {
        __WHISPR_DESKTOP_SNAPSHOTS__: { [eventName]: snapshot },
      });
      const received: VoiceMiniSnapshot[] = [];
      const unsubscribe = subscribe(target, (value) => received.push(value));
      assert.deepEqual(received, [snapshot]);
      const inactive = { ...snapshot, active: false };
      target.dispatchEvent(new CustomEvent(eventName, { detail: inactive }));
      assert.deepEqual(received, [snapshot, inactive]);
      unsubscribe();
      target.dispatchEvent(new CustomEvent(eventName, { detail: snapshot }));
      assert.equal(received.length, 2);
    });

    it("ignores malformed cached values and events without losing later valid data", () => {
      const target = Object.assign(new EventTarget(), {
        __WHISPR_DESKTOP_SNAPSHOTS__: {
          [eventName]: { active: "yes" },
        },
      });
      const received: VoiceMiniSnapshot[] = [];
      const unsubscribe = subscribe(target, (value) => received.push(value));
      target.dispatchEvent(new CustomEvent(eventName, { detail: null }));
      assert.equal(received.length, 0);
      target.dispatchEvent(new CustomEvent(eventName, { detail: snapshot }));
      assert.deepEqual(received, [snapshot]);
      unsubscribe();
    });
  });
}

describe("game overlay participant visibility", () => {
  it("keeps initial, inactive and speaking-only idle overlays empty", () => {
    assert.deepEqual(getVisibleGameOverlayParticipants(null), []);
    assert.deepEqual(getVisibleGameOverlayParticipants({ ...snapshot, active: false }), []);
    assert.deepEqual(
      getVisibleGameOverlayParticipants({
        ...snapshot,
        overlay: { ...snapshot.overlay!, speakingOnly: true },
      }),
      [],
    );
    assert.deepEqual(getVisibleGameOverlayParticipants(snapshot), snapshot.participants);
  });

  it("retains participant limits and speaking filters", () => {
    const participants = Array.from({ length: 12 }, (_, index) => ({
      ...snapshot.participants[0]!,
      userId: `user-${index}`,
      isSpeaking: index % 2 === 0,
    }));
    for (const [size, limit] of [
      ["compact", 3],
      ["normal", 6],
      ["large", 8],
    ] as const) {
      assert.equal(
        getVisibleGameOverlayParticipants({
          ...snapshot,
          participants,
          overlay: { anchor: "top-left", size, speakingOnly: false },
        }).length,
        limit,
      );
    }
    assert.ok(
      getVisibleGameOverlayParticipants({
        ...snapshot,
        participants,
        overlay: { anchor: "top-left", size: "large", speakingOnly: true },
      }).every((participant) => participant.isSpeaking),
    );
  });
});

describe("desktop game overlay state machine", () => {
  it("moves through show, visible, repair, and hide states explicitly", () => {
    assert.equal(
      transitionDesktopGameOverlayState("hidden", { type: "show-requested" }),
      "preparing",
    );
    assert.equal(
      transitionDesktopGameOverlayState("preparing", { type: "show-succeeded" }),
      "visible",
    );
    assert.equal(
      transitionDesktopGameOverlayState("visible", { type: "repair-requested" }),
      "repairing",
    );
    assert.equal(
      transitionDesktopGameOverlayState("repairing", { type: "repair-succeeded" }),
      "visible",
    );
    assert.equal(transitionDesktopGameOverlayState("visible", { type: "hide" }), "hidden");
  });

  it("treats failed and in-flight states separately", () => {
    assert.equal(transitionDesktopGameOverlayState("preparing", { type: "show-failed" }), "failed");
    assert.equal(
      transitionDesktopGameOverlayState("repairing", { type: "repair-failed" }),
      "failed",
    );
    assert.equal(isDesktopGameOverlayOperationInFlight("preparing"), true);
    assert.equal(isDesktopGameOverlayOperationInFlight("repairing"), true);
    assert.equal(isDesktopGameOverlayOperationInFlight("visible"), false);
  });

  it("does not start a repair cycle while explicitly hidden", () => {
    assert.equal(
      transitionDesktopGameOverlayState("hidden", { type: "repair-requested" }),
      "hidden",
    );
    assert.equal(transitionDesktopGameOverlayState("hidden", { type: "repair-failed" }), "hidden");
  });
});
