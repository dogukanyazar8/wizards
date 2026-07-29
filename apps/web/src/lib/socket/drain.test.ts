import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drainSocketServer } from "./drain";

function createServer(sockets: number, closeBehaviour: "hang" | "immediate" = "immediate") {
  const disconnected: boolean[] = [];
  const map = new Map<string, { disconnect(close: boolean): void }>();

  for (let index = 0; index < sockets; index += 1) {
    map.set(`socket-${index}`, {
      disconnect: (close: boolean) => {
        disconnected.push(close);
      },
    });
  }

  return {
    disconnected,
    server: {
      close: (callback?: () => void) => {
        if (closeBehaviour === "immediate") {
          callback?.();
        }
      },
      sockets: { sockets: map },
    } as never,
  };
}

describe("drainSocketServer", () => {
  it("closes every socket with the transport before shutting the server", async () => {
    const { disconnected, server } = createServer(3);

    const result = await drainSocketServer({ server });

    assert.equal(result.status, "drained");
    assert.equal(result.closedSockets, 3);
    assert.deepEqual(disconnected, [true, true, true]);
  });

  it("reports a timeout instead of hanging the deploy", async () => {
    const { server } = createServer(1, "hang");

    const result = await drainSocketServer({ server, waitMs: async () => undefined });

    assert.equal(result.status, "timeout");
  });

  it("says so when there is no socket server to drain", async () => {
    const result = await drainSocketServer({ server: null });

    assert.deepEqual(result, { closedSockets: 0, status: "no-server" });
  });
});
