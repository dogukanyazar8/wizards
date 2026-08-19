import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { createAdapter } from "@socket.io/redis-adapter";
import { io as createSocketClient, type Socket as ClientSocket } from "socket.io-client";

import { disconnectAuthSessionSockets, getSocketServer, setSocketServer } from "./runtime";
import { createSocketServerWithRedisAdapter } from "./redis-adapter";
import { getAuthSessionSocketRoomName } from "./rooms";
import { closeHeadlessSocketServer, initHeadlessSocketServer } from "./worker-runtime";

type TestRedisMessageListener = (message: unknown, channel: string) => void;

class TestRedisPubSubBus {
  private readonly channelListeners = new Map<string, Set<TestRedisMessageListener>>();
  private readonly patternListeners = new Map<string, Set<TestRedisMessageListener>>();

  createClient() {
    return new TestRedisClient(this);
  }

  publish(channel: string, message: unknown) {
    const deliveredMessage = typeof message === "string" ? Buffer.from(message) : message;
    const listeners = [
      ...Array.from(this.channelListeners.get(channel) ?? []),
      ...Array.from(this.patternListeners.entries()).flatMap(([pattern, listeners]) =>
        this.matchesPattern(channel, pattern) ? Array.from(listeners) : [],
      ),
    ];

    for (const listener of listeners) {
      queueMicrotask(() => listener(deliveredMessage, channel));
    }
  }

  subscribe(channel: string, listener: TestRedisMessageListener) {
    const listeners = this.channelListeners.get(channel) ?? new Set<TestRedisMessageListener>();
    listeners.add(listener);
    this.channelListeners.set(channel, listeners);
  }

  unsubscribe(channel: string, listener: TestRedisMessageListener) {
    this.channelListeners.get(channel)?.delete(listener);
  }

  pSubscribe(pattern: string, listener: TestRedisMessageListener) {
    const listeners = this.patternListeners.get(pattern) ?? new Set<TestRedisMessageListener>();
    listeners.add(listener);
    this.patternListeners.set(pattern, listeners);
  }

  pUnsubscribe(pattern: string, listener: TestRedisMessageListener) {
    this.patternListeners.get(pattern)?.delete(listener);
  }

  private matchesPattern(channel: string, pattern: string) {
    return pattern.endsWith("*") ? channel.startsWith(pattern.slice(0, -1)) : channel === pattern;
  }
}

class TestRedisClient {
  constructor(private readonly bus: TestRedisPubSubBus) {}

  on() {
    return this;
  }

  off() {
    return this;
  }

  async publish(channel: string, message: unknown) {
    this.bus.publish(channel, message);
    return 1;
  }

  async pSubscribe(pattern: string, listener: TestRedisMessageListener) {
    this.bus.pSubscribe(pattern, listener);
  }

  async pUnsubscribe(pattern: string, listener: TestRedisMessageListener) {
    this.bus.pUnsubscribe(pattern, listener);
  }

  async subscribe(channels: string | string[], listener: TestRedisMessageListener) {
    for (const channel of Array.isArray(channels) ? channels : [channels]) {
      this.bus.subscribe(channel, listener);
    }
  }

  async unsubscribe(channels: string | string[], listener: TestRedisMessageListener) {
    for (const channel of Array.isArray(channels) ? channels : [channels]) {
      this.bus.unsubscribe(channel, listener);
    }
  }
}

function waitForClientEvent<T>(client: ClientSocket, eventName: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, 1_000);
    timeout.unref?.();

    client.once(eventName, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function closeWebSocketServer(
  io: ReturnType<typeof createSocketServerWithRedisAdapter>,
  httpServer: ReturnType<typeof createServer>,
) {
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
}

describe("headless socket worker runtime", () => {
  it("registers a Socket.IO server in the process-local runtime", async () => {
    const io = initHeadlessSocketServer({
      adapterFactory: null,
      setRuntimeSocketServer: setSocketServer,
    });

    try {
      assert.equal(getSocketServer(), io);
    } finally {
      await closeHeadlessSocketServer(io);
    }
  });

  it("uses the Socket.IO adapter broadcast surface for room emits", async () => {
    const broadcasts: Array<{ eventName: string; rooms: string[] }> = [];
    const io = initHeadlessSocketServer({
      adapterFactory: null,
      setRuntimeSocketServer: setSocketServer,
    });
    const adapter = io.of("/").adapter;
    const originalBroadcast = adapter.broadcast.bind(adapter);
    adapter.broadcast = (packet, opts) => {
      broadcasts.push({
        eventName: String(packet.data[0]),
        rooms: Array.from(opts.rooms).sort(),
      });
      originalBroadcast(packet, opts);
    };

    try {
      io.to("user:user-1").emit("notification:new", {
        actionUrl: null,
        body: "Mentioned you",
        createdAt: new Date(0).toISOString(),
        id: "notification-1",
        imageUrl: null,
        metadata: null,
        read: false,
        readAt: null,
        title: "New mention",
        type: "MENTION",
        userId: "user-1",
      });

      assert.deepEqual(broadcasts, [
        {
          eventName: "notification:new",
          rooms: ["user:user-1"],
        },
      ]);
    } finally {
      await closeHeadlessSocketServer(io);
    }
  });

  it("relays worker notification emits to sockets connected on a separate web server through the Redis adapter", async () => {
    const bus = new TestRedisPubSubBus();
    const adapterKey = `worker-runtime-test-${Date.now()}`;
    const httpServer = createServer();
    const webIo = createSocketServerWithRedisAdapter({
      adapterFactory: createAdapter(bus.createClient(), bus.createClient(), {
        key: adapterKey,
        requestsTimeout: 100,
      }),
      httpServer,
    });
    const workerIo = initHeadlessSocketServer({
      adapterFactory: createAdapter(bus.createClient(), bus.createClient(), {
        key: adapterKey,
        requestsTimeout: 100,
      }),
      setRuntimeSocketServer: setSocketServer,
    });
    let client: ClientSocket | null = null;

    try {
      assert.equal(webIo.of("/").adapter.constructor.name, "RedisAdapter");
      assert.equal(workerIo.of("/").adapter.constructor.name, "RedisAdapter");

      const socketJoined = new Promise<void>((resolve) => {
        webIo.on("connection", async (socket) => {
          await socket.join("user:user-1");
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        httpServer.listen(0, "127.0.0.1", () => resolve());
      });
      const address = httpServer.address();
      assert.ok(address && typeof address === "object");

      client = createSocketClient(`http://127.0.0.1:${address.port}`, {
        reconnection: false,
        transports: ["websocket"],
      });
      const clientConnected = new Promise<void>((resolve, reject) => {
        client?.once("connect", () => resolve());
        client?.once("connect_error", reject);
      });

      await Promise.all([clientConnected, socketJoined]);
      const receivedNotification = waitForClientEvent(client, "notification:new");

      getSocketServer()
        ?.to("user:user-1")
        .emit("notification:new", {
          actionUrl: null,
          body: "Mentioned you from the worker",
          createdAt: new Date(0).toISOString(),
          id: "notification-redis-relay",
          imageUrl: null,
          metadata: null,
          read: false,
          readAt: null,
          title: "Worker mention",
          type: "MENTION",
          userId: "user-1",
        });

      assert.deepEqual(await receivedNotification, {
        actionUrl: null,
        body: "Mentioned you from the worker",
        createdAt: new Date(0).toISOString(),
        id: "notification-redis-relay",
        imageUrl: null,
        metadata: null,
        read: false,
        readAt: null,
        title: "Worker mention",
        type: "MENTION",
        userId: "user-1",
      });
    } finally {
      client?.disconnect();
      await closeHeadlessSocketServer(workerIo);
      await closeWebSocketServer(webIo, httpServer);
    }
  });

  it("disconnects only the targeted auth session across Redis adapter instances", async () => {
    const bus = new TestRedisPubSubBus();
    const adapterKey = `worker-runtime-disconnect-test-${Date.now()}`;
    const httpServer = createServer();
    const webIo = createSocketServerWithRedisAdapter({
      adapterFactory: createAdapter(bus.createClient(), bus.createClient(), {
        key: adapterKey,
        requestsTimeout: 100,
      }),
      httpServer,
    });
    const workerIo = initHeadlessSocketServer({
      adapterFactory: createAdapter(bus.createClient(), bus.createClient(), {
        key: adapterKey,
        requestsTimeout: 100,
      }),
      setRuntimeSocketServer: setSocketServer,
    });
    let targetedClient: ClientSocket | null = null;
    let siblingClient: ClientSocket | null = null;

    try {
      const joinedSessionIds = new Set<string>();
      let resolveSocketsJoined: (() => void) | null = null;
      const socketsJoined = new Promise<void>((resolve) => {
        resolveSocketsJoined = resolve;
      });
      webIo.on("connection", async (socket) => {
        const sessionId = String(socket.handshake.auth.sessionId);
        await socket.join(getAuthSessionSocketRoomName(sessionId));
        joinedSessionIds.add(sessionId);
        if (joinedSessionIds.size === 2) resolveSocketsJoined?.();
      });

      await new Promise<void>((resolve) => {
        httpServer.listen(0, "127.0.0.1", () => resolve());
      });
      const address = httpServer.address();
      assert.ok(address && typeof address === "object");

      targetedClient = createSocketClient(`http://127.0.0.1:${address.port}`, {
        auth: { sessionId: "target-session" },
        reconnection: false,
        transports: ["websocket"],
      });
      siblingClient = createSocketClient(`http://127.0.0.1:${address.port}`, {
        auth: { sessionId: "sibling-session" },
        reconnection: false,
        transports: ["websocket"],
      });
      await Promise.all([
        waitForClientEvent(targetedClient, "connect"),
        waitForClientEvent(siblingClient, "connect"),
        socketsJoined,
      ]);
      const targetedDisconnected = waitForClientEvent(targetedClient, "disconnect");

      disconnectAuthSessionSockets("target-session", workerIo);

      await targetedDisconnected;
      assert.equal(targetedClient.connected, false);
      assert.equal(siblingClient.connected, true);
    } finally {
      targetedClient?.disconnect();
      siblingClient?.disconnect();
      await closeHeadlessSocketServer(workerIo);
      await closeWebSocketServer(webIo, httpServer);
    }
  });
});
