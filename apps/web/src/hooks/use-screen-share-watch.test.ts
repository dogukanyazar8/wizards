import assert from "node:assert/strict";
import { test } from "node:test";
import { startScreenShareWatchHeartbeat } from "./use-screen-share-watch";

test("visible watch renews at 60s, reconnects and removes itself once hidden", (context) => {
  context.mock.timers.enable({ apis: ["setInterval"] });
  const sent: unknown[] = [];
  let reconnect: (() => void) | undefined;
  const socket = {
    connected: true,
    emit: (_event: string, data: unknown) => sent.push(data),
    on: (_event: string, handler: () => void) => {
      reconnect = handler;
    },
    off: () => {
      reconnect = undefined;
    },
  };
  const target = { channelId: "c1", serverId: "s1", sharerUserId: "u1" };
  const stop = startScreenShareWatchHeartbeat(socket as never, target);
  assert.deepEqual(sent, [{ ...target, watching: true }]);
  context.mock.timers.tick(60_000);
  assert.equal(sent.length, 2);
  reconnect?.();
  assert.equal(sent.length, 3);
  stop();
  assert.deepEqual(sent[3], { ...target, watching: false });
  context.mock.timers.tick(120_000);
  assert.equal(sent.length, 4);
  assert.equal(reconnect, undefined);
});
