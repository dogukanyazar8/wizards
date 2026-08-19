import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  LIVEKIT_CONNECT_RETRY_DELAYS_MS,
  ROOM_PARTICIPANT_SYNC_EVENTS,
  connectLiveKitRoomWithRetry,
  createReconnectTimeoutController,
  createVoiceAudioContext,
  createVoiceAudioLevelMonitor,
  getParticipantAudioActivity,
  normalizeVoiceAudioLevel,
  registerRoomParticipantSyncListeners,
  shouldUpdateParticipantAudioActivity,
  type RoomParticipantSyncEmitter,
} from "./provider-lifecycle";

type BrowserGlobal = typeof globalThis & {
  MediaStream?: new (tracks: MediaStreamTrack[]) => MediaStream;
  window?: Window;
};

const browserGlobal = globalThis as BrowserGlobal;
const originalWindow = browserGlobal.window;
const originalMediaStream = browserGlobal.MediaStream;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(browserGlobal, "window");
  } else {
    Object.defineProperty(browserGlobal, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  }

  if (originalMediaStream === undefined) {
    Reflect.deleteProperty(browserGlobal, "MediaStream");
  } else {
    Object.defineProperty(browserGlobal, "MediaStream", {
      configurable: true,
      value: originalMediaStream,
      writable: true,
    });
  }
});

describe("voice provider lifecycle helpers", () => {
  it("normalizes remote and local audio levels into the expected 0..1 range", () => {
    assert.equal(normalizeVoiceAudioLevel(Number.NaN), 0);
    assert.equal(normalizeVoiceAudioLevel(Number.POSITIVE_INFINITY), 0);
    assert.equal(normalizeVoiceAudioLevel(-0.4), 0);
    assert.equal(normalizeVoiceAudioLevel(0.45), 0.45);
    assert.equal(normalizeVoiceAudioLevel(2), 1);
  });

  it("derives participant audio activity from LiveKit microphone state", () => {
    const mutedParticipant = {
      audioLevel: 0.9,
      getTrackPublication: () => ({ isMuted: true }),
      isMicrophoneEnabled: true,
      isSpeaking: true,
    };
    const speakingParticipant = {
      audioLevel: 0.03,
      getTrackPublication: () => ({ isMuted: false }),
      isMicrophoneEnabled: true,
      isSpeaking: false,
    };

    assert.deepEqual(getParticipantAudioActivity(mutedParticipant as never), {
      audioLevel: 0,
      isMuted: true,
      isSpeaking: false,
    });
    assert.deepEqual(getParticipantAudioActivity(speakingParticipant as never), {
      audioLevel: 0.03,
      isMuted: false,
      isSpeaking: true,
    });
  });

  it("updates participant audio state only when muted/speaking flags or level threshold changes", () => {
    assert.equal(
      shouldUpdateParticipantAudioActivity(
        { audioLevel: 0.2, isMuted: false, isSpeaking: true },
        { audioLevel: 0.205, isMuted: false, isSpeaking: true },
      ),
      false,
    );
    assert.equal(
      shouldUpdateParticipantAudioActivity(
        { audioLevel: 0.2, isMuted: false, isSpeaking: true },
        { audioLevel: 0.215, isMuted: false, isSpeaking: true },
      ),
      true,
    );
    assert.equal(
      shouldUpdateParticipantAudioActivity(
        { audioLevel: 0.2, isMuted: false, isSpeaking: true },
        { audioLevel: 0.2, isMuted: true, isSpeaking: false },
      ),
      true,
    );
  });

  it("returns no audio monitor for ended tracks", () => {
    let constructorCalls = 0;
    Object.defineProperty(browserGlobal, "window", {
      configurable: true,
      value: {
        AudioContext: class {
          constructor() {
            constructorCalls += 1;
          }
        },
      },
      writable: true,
    });

    const monitor = createVoiceAudioLevelMonitor({ readyState: "ended" } as MediaStreamTrack);

    assert.equal(monitor, null);
    assert.equal(constructorCalls, 0);
  });

  it("closes an internally owned audio context when monitor initialization fails", () => {
    const created: { context?: FakeAudioContext } = {};

    class FakeAudioContext {
      closeCalls = 0;

      constructor() {
        created.context = this;
      }

      async close() {
        this.closeCalls += 1;
      }

      createAnalyser() {
        throw new Error("analyser unavailable");
      }
    }

    Object.defineProperty(browserGlobal, "window", {
      configurable: true,
      value: { AudioContext: FakeAudioContext },
      writable: true,
    });

    const monitor = createVoiceAudioLevelMonitor({ readyState: "live" } as MediaStreamTrack);

    assert.equal(monitor, null);
    assert.equal(created.context?.closeCalls, 1);
  });

  it("creates and disposes the audio level monitor without leaking AudioContext resources", () => {
    const created: { context?: FakeAudioContext } = {};

    class FakeAnalyser {
      fftSize = 0;
      smoothingTimeConstant = 0;

      getByteTimeDomainData(samples: Uint8Array) {
        samples.fill(160);
      }
    }

    class FakeSource {
      connectCalls = 0;
      disconnectCalls = 0;

      connect() {
        this.connectCalls += 1;
      }

      disconnect() {
        this.disconnectCalls += 1;
      }
    }

    class FakeAudioContext {
      readonly analyser = new FakeAnalyser();
      readonly source = new FakeSource();
      closeCalls = 0;
      resumeCalls = 0;

      constructor() {
        created.context = this;
      }

      createAnalyser() {
        return this.analyser;
      }

      createMediaStreamSource() {
        return this.source;
      }

      async close() {
        this.closeCalls += 1;
      }

      async resume() {
        this.resumeCalls += 1;
      }
    }

    class FakeMediaStream {
      constructor(readonly tracks: MediaStreamTrack[]) {}
    }

    Object.defineProperty(browserGlobal, "window", {
      configurable: true,
      value: { AudioContext: FakeAudioContext },
      writable: true,
    });
    Object.defineProperty(browserGlobal, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
      writable: true,
    });

    const audioContext = createVoiceAudioContext();
    assert.ok(audioContext);
    const monitor = createVoiceAudioLevelMonitor(
      { readyState: "live" } as MediaStreamTrack,
      audioContext,
    );

    assert.ok(monitor);
    const context = created.context;
    assert.ok(context);
    assert.equal(context.analyser.fftSize, 512);
    assert.equal(context.analyser.smoothingTimeConstant, 0.18);
    assert.equal(context.source.connectCalls, 1);
    assert.equal(context.resumeCalls, 1);
    assert.equal(monitor.readLevel(), 1);

    monitor.dispose();

    assert.equal(context.source.disconnectCalls, 1);
    assert.equal(context.closeCalls, 1);
  });

  it("retries transient LiveKit connection failures with disconnect cleanup between attempts", async () => {
    const delays: number[] = [];
    const disconnectCalls: boolean[] = [];
    let connectCalls = 0;
    const room = {
      async connect() {
        connectCalls += 1;
        if (connectCalls <= 2) {
          throw new Error("ICE transport timeout");
        }
      },
      async disconnect(stopTracks?: boolean) {
        disconnectCalls.push(stopTracks ?? false);
      },
    };

    await connectLiveKitRoomWithRetry(room, "wss://voice.example", "token", {
      wait: async (ms) => {
        delays.push(ms);
      },
    });

    assert.equal(connectCalls, 3);
    assert.deepEqual(delays, [...LIVEKIT_CONNECT_RETRY_DELAYS_MS]);
    assert.deepEqual(disconnectCalls, [true, true]);
  });

  it("does not retry non-transient LiveKit connection failures", async () => {
    const room = {
      async connect() {
        throw new Error("invalid token");
      },
      async disconnect() {
        throw new Error("disconnect should not be called");
      },
    };

    await assert.rejects(
      () =>
        connectLiveKitRoomWithRetry(room, "wss://voice.example", "token", {
          wait: async () => undefined,
        }),
      /invalid token/,
    );
  });

  it("registers and removes the participant sync LiveKit room listeners as a single owned group", () => {
    const onCalls: string[] = [];
    const offCalls: string[] = [];
    const handlers = new Map<string, Set<() => void>>();
    const room: RoomParticipantSyncEmitter = {
      off(event, handler) {
        offCalls.push(event);
        handlers.get(event)?.delete(handler);
      },
      on(event, handler) {
        onCalls.push(event);
        const eventHandlers = handlers.get(event) ?? new Set<() => void>();
        eventHandlers.add(handler);
        handlers.set(event, eventHandlers);
      },
    };
    const handler = () => undefined;

    const cleanup = registerRoomParticipantSyncListeners(room, handler);

    assert.deepEqual(onCalls, [...ROOM_PARTICIPANT_SYNC_EVENTS]);
    for (const event of ROOM_PARTICIPANT_SYNC_EVENTS) {
      assert.equal(handlers.get(event)?.size, 1, event);
    }

    cleanup();

    assert.deepEqual(offCalls, [...ROOM_PARTICIPANT_SYNC_EVENTS]);
    for (const event of ROOM_PARTICIPANT_SYNC_EVENTS) {
      assert.equal(handlers.get(event)?.size, 0, event);
    }
  });

  it("clears reconnect warning timeouts idempotently and replaces stale timers", () => {
    const callbacks = new Map<number, () => void>();
    const cleared: number[] = [];
    let nextHandle = 1;
    let fired = 0;
    const controller = createReconnectTimeoutController({
      clearTimeout(handle: number) {
        cleared.push(handle);
        callbacks.delete(handle);
      },
      setTimeout(callback: () => void) {
        const handle = nextHandle;
        nextHandle += 1;
        callbacks.set(handle, callback);
        return handle;
      },
    });

    controller.schedule(() => {
      fired += 1;
    }, 30_000);
    controller.schedule(() => {
      fired += 10;
    }, 30_000);

    assert.equal(controller.hasPending(), true);
    assert.deepEqual(cleared, [1]);

    callbacks.get(2)?.();
    assert.equal(fired, 10);
    assert.equal(controller.hasPending(), false);

    controller.clear();
    controller.clear();

    assert.deepEqual(cleared, [1]);
  });
});
