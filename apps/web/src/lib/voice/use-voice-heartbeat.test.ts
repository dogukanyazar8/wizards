import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createVoiceHeartbeatController, type VoiceHeartbeatOptions } from "./use-voice-heartbeat";

function createFakeIntervalApi() {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  let nextHandle = 1;

  return {
    callbacks,
    cleared,
    timers: {
      clearInterval(handle: number) {
        cleared.push(handle);
        callbacks.delete(handle);
      },
      setInterval(callback: () => void) {
        const handle = nextHandle;
        nextHandle += 1;
        callbacks.set(handle, callback);
        return handle;
      },
    },
  };
}

describe("voice heartbeat controller", () => {
  it("sends the captured heartbeat payload on each timer tick", async () => {
    const fake = createFakeIntervalApi();
    const calls: Array<{ payload: unknown; sessionId: string }> = [];
    const ticked: string[] = [];
    const options: VoiceHeartbeatOptions = {
      getPayload: () => ({
        selfStream: true,
        selfVideo: false,
      }),
      intervalMs: 5_000,
      onTick: (sessionId) => ticked.push(sessionId),
      sendHeartbeat: async (sessionId, payload) => {
        calls.push({ payload, sessionId });
      },
    };
    const controller = createVoiceHeartbeatController(fake.timers, options);

    controller.start("session-1");
    fake.callbacks.get(1)?.();
    await Promise.resolve();

    assert.equal(controller.isRunning(), true);
    assert.deepEqual(calls, [
      {
        payload: {
          selfStream: true,
          selfVideo: false,
        },
        sessionId: "session-1",
      },
    ]);
    assert.deepEqual(ticked, ["session-1"]);
  });

  it("replaces the active interval when a new session starts", () => {
    const fake = createFakeIntervalApi();
    const controller = createVoiceHeartbeatController(fake.timers, {
      getPayload: () => ({}),
      intervalMs: 10_000,
      sendHeartbeat: async () => undefined,
    });

    controller.start("session-1");
    controller.start("session-2");

    assert.deepEqual(fake.cleared, [1]);
    assert.equal(fake.callbacks.has(1), false);
    assert.equal(fake.callbacks.has(2), true);
  });

  it("keeps running heartbeat ticks isolated to the options captured at start", async () => {
    const fake = createFakeIntervalApi();
    const calls: unknown[] = [];
    const controller = createVoiceHeartbeatController(fake.timers, {
      getPayload: () => ({ selfVideo: false }),
      intervalMs: 10_000,
      sendHeartbeat: async (_sessionId, payload) => {
        calls.push(payload);
      },
    });

    controller.start("session-1");
    controller.updateOptions({
      getPayload: () => ({ selfVideo: true }),
      intervalMs: 10_000,
      sendHeartbeat: async (_sessionId, payload) => {
        calls.push(payload);
      },
    });
    fake.callbacks.get(1)?.();
    await Promise.resolve();

    assert.deepEqual(calls, [{ selfVideo: false }]);
  });

  it("stops idempotently", () => {
    const fake = createFakeIntervalApi();
    const controller = createVoiceHeartbeatController(fake.timers, {
      getPayload: () => ({}),
      intervalMs: 10_000,
      sendHeartbeat: async () => undefined,
    });

    controller.start("session-1");
    controller.stop();
    controller.stop();

    assert.equal(controller.isRunning(), false);
    assert.deepEqual(fake.cleared, [1]);
  });
});
