import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { disposeMobileVoiceRecording } from "../src/media/mobile-voice-recording-lifecycle";

describe("mobile voice recording disposal", () => {
  it("settles preparation, stops the recording, deletes its file, and restores playback", async () => {
    const events: string[] = [];
    await disposeMobileVoiceRecording({
      deleteFile: async (uri) => {
        events.push(`delete:${uri}`);
      },
      getUri: () => "file:///cache/voice.m4a",
      isRecording: () => true,
      restorePlayback: async () => {
        events.push("restore");
      },
      settleStart: async () => {
        events.push("settle");
      },
      stop: async () => {
        events.push("stop");
      },
    });

    assert.deepEqual(events, ["settle", "stop", "delete:file:///cache/voice.m4a", "restore"]);
  });

  it("restores playback even when native stop fails", async () => {
    const events: string[] = [];
    await disposeMobileVoiceRecording({
      deleteFile: async () => undefined,
      getUri: () => null,
      isRecording: () => true,
      restorePlayback: async () => {
        events.push("restore");
      },
      settleStart: async () => undefined,
      stop: async () => {
        throw new Error("native stop failed");
      },
    });

    assert.deepEqual(events, ["restore"]);
  });
});
