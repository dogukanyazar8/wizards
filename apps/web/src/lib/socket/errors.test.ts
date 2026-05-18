import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import {
  createDMErrorEmitter,
  createSafeDMErrorEmitter,
  createSocketErrorEmitter,
  createVoiceInviteErrorEmitter,
} from "./errors";
import type { AppSocket } from "./context";

function createSocketRecorder() {
  const events: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    emit(event: string, payload: unknown) {
      events.push({ event, payload });
    },
  } as AppSocket;

  return { events, socket };
}

describe("socket error emitters", () => {
  it("formats generic ApiError values for the shared socket error event", () => {
    const { events, socket } = createSocketRecorder();
    const emitSocketError = createSocketErrorEmitter(socket);

    emitSocketError("FALLBACK", "Fallback message", new ApiError("Nope", 403, "NOPE"));

    assert.deepEqual(events, [
      {
        event: "error",
        payload: {
          code: "NOPE",
          message: "Nope",
        },
      },
    ]);
  });

  it("keeps DM errors constrained to the DM error contract", () => {
    const { events, socket } = createSocketRecorder();
    const emitSafeDMError = createSafeDMErrorEmitter(socket);

    emitSafeDMError("FORBIDDEN", "Fallback", new ApiError("Weird", 500, "SOMETHING_ELSE"));

    assert.deepEqual(events, [
      {
        event: "dm:error",
        payload: {
          code: "FORBIDDEN",
          message: "Weird",
        },
      },
    ]);
  });

  it("emits direct DM and voice invite errors without socket server dependencies", () => {
    const { events, socket } = createSocketRecorder();
    const emitDMError = createDMErrorEmitter(socket);
    const emitVoiceInviteError = createVoiceInviteErrorEmitter(socket);

    emitDMError("RATE_LIMITED", "Slow down.");
    emitVoiceInviteError({
      channelId: "channel-1",
      code: "VOICE_INVITE_ERROR",
      error: new ApiError("Invite denied", 403, "VOICE_INVITE_FORBIDDEN"),
      fallbackMessage: "Fallback",
      targetUserId: "user-2",
    });

    assert.deepEqual(events, [
      {
        event: "dm:error",
        payload: {
          code: "RATE_LIMITED",
          message: "Slow down.",
        },
      },
      {
        event: "voice:invite:error",
        payload: {
          channelId: "channel-1",
          code: "VOICE_INVITE_FORBIDDEN",
          message: "Invite denied",
          targetUserId: "user-2",
        },
      },
    ]);
  });
});
