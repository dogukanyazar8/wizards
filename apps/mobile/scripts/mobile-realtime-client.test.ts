import assert from "node:assert/strict";
import test from "node:test";

import {
  createMobileRealtimeClient,
  type MobileRealtimeSocket,
} from "../src/realtime/mobile-realtime-client";

test("disconnect prevents a token-delayed connect from reviving the socket", async () => {
  let connectCalls = 0;
  let disconnectCalls = 0;
  let resolveToken!: (token: string | null) => void;
  const token = new Promise<string | null>((resolve) => {
    resolveToken = resolve;
  });
  const fakeSocket = {
    auth: {},
    connected: false,
    connect() {
      connectCalls += 1;
      return this;
    },
    disconnect() {
      disconnectCalls += 1;
      return this;
    },
    emit() {
      return this;
    },
    io: {
      on() {
        return this;
      },
    },
    on() {
      return this;
    },
    removeAllListeners() {
      return this;
    },
  } as unknown as MobileRealtimeSocket;
  const client = createMobileRealtimeClient({
    createSocket: () => fakeSocket,
    getAccessToken: () => token,
    onEvent: () => {},
    socketUrl: "https://socket.invalid",
  });

  const pendingConnect = client.connect();
  client.disconnect();
  resolveToken("access-token");
  await pendingConnect;

  assert.equal(disconnectCalls, 1);
  assert.equal(connectCalls, 0);
});
