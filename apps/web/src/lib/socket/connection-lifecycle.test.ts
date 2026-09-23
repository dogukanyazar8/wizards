import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { it } from "node:test";
import type { Socket } from "socket.io-client";
import { attachSocketLifecycle } from "./connection-lifecycle";
import { SocketAuthenticationUnavailableError } from "./authentication";

class Client extends EventEmitter {
  connected = false;
  active = false;
  attempts = 0;
  connect() {
    this.attempts++;
    return this;
  }
  disconnect() {
    this.connected = false;
    this.emit("disconnect", "io client disconnect");
    return this;
  }
}

it("retries only temporary middleware failures with one timer; stops on terminal refusal", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const client = new Client();
  const lifecycle = attachSocketLifecycle(client as unknown as Socket, () => 0.5);
  assert.equal(client.attempts, 1);
  client.emit("connect_error", { data: { code: "SESSION_CHECK_UNAVAILABLE" } });
  client.emit("connect_error", { data: { code: "SESSION_CHECK_UNAVAILABLE" } });
  t.mock.timers.tick(999);
  assert.equal(client.attempts, 1);
  t.mock.timers.tick(1);
  assert.equal(client.attempts, 2);
  client.emit("connect_error", new Error("Unauthorized"));
  lifecycle.wake();
  t.mock.timers.tick(60_000);
  assert.equal(client.attempts, 2);
  lifecycle.stop();
  assert.equal(client.listenerCount("connect_error"), 0);
});

it(
  "recovers from a real middleware outage through a new authenticated handshake",
  { timeout: 5000 },
  async () => {
    const http = createServer();
    const server = new Server(http);
    let checks = 0;
    server.use((_socket, next) => {
      checks++;
      next(checks === 1 ? new SocketAuthenticationUnavailableError() : undefined);
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert(address && typeof address !== "string");
    const client = io(`http://127.0.0.1:${address.port}`, {
      autoConnect: false,
      transports: ["websocket"],
    });
    const connected = new Promise<void>((resolve) => client.once("connect", resolve));
    const lifecycle = attachSocketLifecycle(client, () => 0);
    try {
      await connected;
      assert.equal(checks, 2);
      assert.equal(client.connected, true);
    } finally {
      lifecycle.stop();
      await server.close();
    }
  },
);

it("leaves transport backoff to the manager and cancels retries on unmount/logout", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const client = new Client();
  const lifecycle = attachSocketLifecycle(client as unknown as Socket);
  client.active = true;
  client.emit("connect_error", new Error("transport error"));
  lifecycle.wake();
  t.mock.timers.tick(60_000);
  assert.equal(client.attempts, 1);
  client.active = false;
  client.emit("connect_error", { data: { code: "SESSION_CHECK_UNAVAILABLE" } });
  client.emit("disconnect", "io server disconnect");
  lifecycle.wake();
  t.mock.timers.tick(60_000);
  assert.equal(client.attempts, 1);
  lifecycle.stop();
  lifecycle.wake();
  t.mock.timers.tick(60_000);
  assert.equal(client.attempts, 1);
});
