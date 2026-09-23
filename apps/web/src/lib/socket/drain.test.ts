import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServer as createHttpServer } from "node:http";
import { Server } from "socket.io";
import { io } from "socket.io-client";

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
  it("counts sockets without sending a terminal namespace disconnect", async () => {
    const { disconnected, server } = createServer(3);

    const result = await drainSocketServer({ server });

    assert.equal(result.status, "drained");
    assert.equal(result.closedSockets, 3);
    assert.deepEqual(disconnected, []);
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

for (const transport of ["polling", "websocket"] as const) {
  it(
    `drain reconnects ${transport} clients to the replacement server`,
    { timeout: 5000 },
    async () => {
      const http = createHttpServer();
      const server = new Server(http);
      await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
      const address = http.address();
      assert(address && typeof address !== "string");
      const replacementHttp = createHttpServer();
      const replacement = new Server(replacementHttp);
      const client = io(`http://127.0.0.1:${address.port}`, {
        transports: [transport],
        autoConnect: false,
        reconnectionDelay: 10,
        reconnectionDelayMax: 25,
        randomizationFactor: 0,
      });
      try {
        const connected = new Promise<void>((resolve) => client.once("connect", resolve));
        client.connect();
        await connected;
        const previousId = client.id;
        const disconnected = new Promise<string>((resolve) => client.once("disconnect", resolve));
        await drainSocketServer({ server: server as never, waitMs: () => new Promise(() => {}) });
        const reason = await disconnected;
        assert.notEqual(reason, "io server disconnect");
        assert.equal(client.active, true);
        const reconnected = new Promise<void>((resolve) => client.once("connect", resolve));
        await new Promise<void>((resolve) =>
          replacementHttp.listen(address.port, "127.0.0.1", resolve),
        );
        await reconnected;
        assert.notEqual(client.id, previousId);
      } finally {
        client.disconnect();
        await server.close();
        await replacement.close();
      }
    },
  );
}
