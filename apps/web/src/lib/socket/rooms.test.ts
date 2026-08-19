import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAuthSessionSocketRoomName,
  getVoiceParticipantRoomName,
  getVoiceStateViewerRoomName,
  joinVoiceStateViewerRoomsForServer,
  leaveVoiceStateViewerRoomsForServer,
} from "./rooms";

describe("socket room helpers", () => {
  it("maps durable session ids to fixed-length opaque room names", () => {
    assert.equal(
      getAuthSessionSocketRoomName("session-1"),
      "auth-session:hAl4KPwxqMjSkhDfSJAahd5_0BP2hrF7530b4py3qYs",
    );
    assert.equal(getAuthSessionSocketRoomName("session-2").length, 56);
    assert.notEqual(
      getAuthSessionSocketRoomName("session-1"),
      getAuthSessionSocketRoomName("session-2"),
    );
  });

  it("builds stable voice participant and viewer room names", () => {
    assert.equal(getVoiceParticipantRoomName("voice-1"), "voice:voice-1");
    assert.equal(getVoiceStateViewerRoomName("voice-1"), "voice-viewers:voice-1");
  });

  it("tracks and replaces voice state viewer rooms per server", async () => {
    const joinedRooms: string[] = [];
    const leftRooms: string[] = [];
    const socket = {
      data: {
        voiceStateViewerChannelsByServer: new Map<string, Set<string>>(),
      },
      join(room: string) {
        joinedRooms.push(room);
      },
      leave(room: string) {
        leftRooms.push(room);
      },
    };

    await joinVoiceStateViewerRoomsForServer(socket as never, "server-1", [
      "voice-1",
      "voice-1",
      "voice-2",
    ]);
    await joinVoiceStateViewerRoomsForServer(socket as never, "server-1", ["voice-3"]);
    await leaveVoiceStateViewerRoomsForServer(socket as never, "server-1");

    assert.deepEqual(joinedRooms, [
      getVoiceStateViewerRoomName("voice-1"),
      getVoiceStateViewerRoomName("voice-2"),
      getVoiceStateViewerRoomName("voice-3"),
    ]);
    assert.deepEqual(leftRooms, [
      getVoiceStateViewerRoomName("voice-1"),
      getVoiceStateViewerRoomName("voice-2"),
      getVoiceStateViewerRoomName("voice-3"),
    ]);
    assert.equal(socket.data.voiceStateViewerChannelsByServer.has("server-1"), false);
  });

  it("does not churn viewer rooms when the resolved channel set is unchanged", async () => {
    const joinedRooms: string[] = [];
    const leftRooms: string[] = [];
    const socket = {
      data: {
        voiceStateViewerChannelsByServer: new Map<string, Set<string>>(),
      },
      join(room: string) {
        joinedRooms.push(room);
      },
      leave(room: string) {
        leftRooms.push(room);
      },
    };

    await joinVoiceStateViewerRoomsForServer(socket as never, "server-1", ["voice-1", "voice-2"]);
    await joinVoiceStateViewerRoomsForServer(socket as never, "server-1", ["voice-2", "voice-1"]);

    assert.deepEqual(joinedRooms, [
      getVoiceStateViewerRoomName("voice-1"),
      getVoiceStateViewerRoomName("voice-2"),
    ]);
    assert.deepEqual(leftRooms, []);
  });
});
