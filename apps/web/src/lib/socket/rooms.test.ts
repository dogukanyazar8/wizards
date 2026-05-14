import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getVoiceStateViewerRoomName,
  joinVoiceStateViewerRoomsForServer,
  leaveVoiceStateViewerRoomsForServer,
} from "./rooms";

describe("socket room helpers", () => {
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
});
