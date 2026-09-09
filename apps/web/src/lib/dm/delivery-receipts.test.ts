import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";

import { broadcastDirectMessageRead } from "./delivery-receipts";

type Emit = { event: string; payload: unknown; rooms: string[] };

function fakeSocketServer(emits: Emit[]) {
  function emitterFor(rooms: string[]) {
    return {
      emit(event: string, payload: unknown) {
        emits.push({ event, payload, rooms });
      },
      to(room: string) {
        return emitterFor([...rooms, room]);
      },
    };
  }

  return { to: (room: string) => emitterFor([room]) } as unknown as AppSocketServer;
}

async function withSocketServer(emits: Emit[], run: () => Promise<void>) {
  setSocketServer(fakeSocketServer(emits));
  try {
    await run();
  } finally {
    setSocketServer(null);
  }
}

/** Mesajlar §15.5 madde 2 — the `Okundu bilgisi` switch, enforced where it publishes. */
describe("DM read receipt broadcast", () => {
  it("fans the stamp out to the room and every personal room when the switch is on", async () => {
    const emits: Emit[] = [];

    await withSocketServer(emits, () =>
      broadcastDirectMessageRead("user-1", "conversation-1", {
        canPublishReadReceipt: async () => true,
        getReadStates: async () => [
          { lastReadAt: new Date("2026-08-27T09:00:00.000Z"), userId: "user-1" },
          { lastReadAt: null, userId: "user-2" },
        ],
      }),
    );

    assert.deepEqual(emits, [
      {
        event: "dm:conversation:read",
        payload: {
          conversationId: "conversation-1",
          lastReadAt: "2026-08-27T09:00:00.000Z",
          userId: "user-1",
        },
        rooms: ["dm:conversation-1", "user:user-1", "user:user-2"],
      },
    ]);
  });

  // Suppressing the whole event rather than one leg of the fan-out is the point:
  // the conversation room holds the counterpart, so any emit at all would put the
  // stamp on the wire.
  it("emits nothing at all when the reader turned read receipts off", async () => {
    const emits: Emit[] = [];
    let readStatesLoaded = false;

    await withSocketServer(emits, () =>
      broadcastDirectMessageRead("user-1", "conversation-1", {
        canPublishReadReceipt: async () => false,
        getReadStates: async () => {
          readStatesLoaded = true;
          return [];
        },
      }),
    );

    assert.deepEqual(emits, []);
    // The gate sits in front of the read too, so an opted-out mark-read does not
    // even pay for the participant lookup.
    assert.equal(readStatesLoaded, false);
  });

  it("asks about the reader, never about the counterpart", async () => {
    const emits: Emit[] = [];
    const asked: string[] = [];

    await withSocketServer(emits, () =>
      broadcastDirectMessageRead("user-1", "conversation-1", {
        canPublishReadReceipt: async (userId) => {
          asked.push(userId);
          return true;
        },
        getReadStates: async () => [{ lastReadAt: null, userId: "user-1" }],
      }),
    );

    assert.deepEqual(asked, ["user-1"]);
  });
});
