import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EVENTS_PUBLIC_ROOM } from "@/lib/events/realtime";
import type { HandlerContext } from "@/lib/socket/context";
import { registerEventHandlers } from "@/lib/socket/handlers/events";

function harness() {
  const listeners = new Map<string, () => void>();
  const joined: string[] = [];
  const left: string[] = [];

  const ctx = {
    socket: {
      join: (room: string) => {
        joined.push(room);
      },
      leave: (room: string) => {
        left.push(room);
      },
      on: (event: string, listener: () => void) => {
        listeners.set(event, listener);
      },
    },
    userId: "u1",
  } as unknown as HandlerContext;

  registerEventHandlers(ctx);

  return {
    emit: (event: string) => listeners.get(event)?.(),
    joined,
    left,
    listeners,
  };
}

describe("events socket handlers", () => {
  it("`events:public:watch` herkese açık odaya alır", () => {
    const socket = harness();

    socket.emit("events:public:watch");

    assert.deepEqual(socket.joined, [EVENTS_PUBLIC_ROOM]);
  });

  it("`events:public:unwatch` odayı bırakır", () => {
    const socket = harness();

    socket.emit("events:public:watch");
    socket.emit("events:public:unwatch");

    assert.deepEqual(socket.left, [EVENTS_PUBLIC_ROOM]);
  });

  it("sunucu odalarına ikinci bir abonelik açmaz", () => {
    const socket = harness();

    // Üyelikten gelen `server:<id>` odaları zaten katılmış durumda; buradan tek oda yönetilir.
    assert.deepEqual(
      [...socket.listeners.keys()],
      ["events:public:watch", "events:public:unwatch"],
    );
  });
});
