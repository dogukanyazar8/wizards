import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createVoicePageExitHandler, type VoicePageExitRoom } from "./page-exit";

function createDeferredRoom(calls: string[]): VoicePageExitRoom {
  return {
    async disconnect(stopTracks?: boolean) {
      calls.push(`disconnect:${String(stopTracks)}`);
    },
  };
}

describe("voice page-exit cleanup", () => {
  it("stops heartbeat and reconnect timers before disconnecting media resources", () => {
    const calls: string[] = [];
    const room = createDeferredRoom(calls);
    const handler = createVoicePageExitHandler({
      clearReconnectTimeout: () => calls.push("clear-reconnect"),
      emitVoiceScreenShareState: (...args) => calls.push(`screen-share:${args[2]}`),
      getRoom: () => room,
      getState: () => ({
        activeChannelId: "channel-1",
        isScreenSharing: true,
        screenShareMode: "voice",
        serverId: "server-1",
        sessionId: "session-1",
      }),
      notifyVoiceExit: async (sessionId) => calls.push(`notify:${sessionId}`),
      stopCamera: async () => calls.push("stop-camera"),
      stopHeartbeat: () => calls.push("stop-heartbeat"),
      stopLocalTracks: async () => calls.push("stop-local-tracks"),
      stopScreenShare: async () => calls.push("stop-screen-share"),
    });

    handler();

    assert.deepEqual(calls.slice(0, 4), [
      "stop-heartbeat",
      "clear-reconnect",
      "screen-share:false",
      "stop-screen-share",
    ]);
  });

  it("does not emit screen-share cleanup for non-voice shares", () => {
    const calls: string[] = [];
    const handler = createVoicePageExitHandler({
      clearReconnectTimeout: () => calls.push("clear-reconnect"),
      emitVoiceScreenShareState: () => calls.push("screen-share"),
      getRoom: () => null,
      getState: () => ({
        activeChannelId: "dm-1",
        isScreenSharing: true,
        screenShareMode: "dm",
        serverId: null,
        sessionId: null,
      }),
      notifyVoiceExit: async () => calls.push("notify"),
      stopCamera: async () => calls.push("stop-camera"),
      stopHeartbeat: () => calls.push("stop-heartbeat"),
      stopLocalTracks: async () => calls.push("stop-local-tracks"),
      stopScreenShare: async () => calls.push("stop-screen-share"),
    });

    handler();

    assert.deepEqual(calls, ["stop-heartbeat", "clear-reconnect"]);
  });
});
