import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HandlerContext } from "../context";
import { registerDMHandlers } from "./dm";

function createHandlerContextRecorder() {
  const events: string[] = [];
  const socket = {
    data: {
      displayName: "Ada",
      userId: "user-1",
      username: "ada",
    },
    on(event: string) {
      events.push(event);
      return socket;
    },
  };

  const ctx = {
    io: {},
    redis: {},
    socket,
    userId: "user-1",
  } as unknown as HandlerContext;

  return { ctx, events };
}

describe("socket DM handlers", () => {
  it("registers all DM socket events", () => {
    const { ctx, events } = createHandlerContextRecorder();

    registerDMHandlers(ctx);

    assert.deepEqual(events, [
      "dm:join",
      "dm:leave",
      "dm:screenshare:start",
      "dm:screenshare:accept",
      "dm:screenshare:decline",
      "dm:screenshare:stop",
      "dm:message:send",
      "dm:message:edit",
      "dm:message:delete",
      "dm:message:react",
      "dm:message:unreact",
    ]);
  });
});
