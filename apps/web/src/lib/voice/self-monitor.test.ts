import assert from "node:assert/strict";
import { test } from "node:test";
import { SelfMonitorSession } from "./self-monitor";
import { DEFAULT_VOICE_AUDIO_PREFERENCES } from "@/store/voice-store";
import type { MicrophoneTestSource } from "./microphone-test";

function fixture() {
  let stops = 0;
  let plays = 0;
  let pauses = 0;
  let output = "";
  const track = Object.assign(new EventTarget(), {
    stop: () => stops++,
  }) as unknown as MediaStreamTrack;
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const source: MicrophoneTestSource = { stream, track, owned: true, released: false };
  const audio = {
    srcObject: null,
    volume: 1,
    play: async () => {
      plays++;
    },
    pause: () => {
      pauses++;
    },
    setSinkId: async (id: string) => {
      output = id;
    },
  } as unknown as HTMLAudioElement;
  return { source, audio, counts: () => ({ stops, plays, pauses, output }) };
}

test("preview routes selected output, plays captured input and releases everything on stop", async () => {
  const f = fixture();
  let captured = "";
  const session = new SelfMonitorSession({
    acquire: async (prefs) => {
      captured = prefs.inputDeviceId;
      return f.source;
    },
    createAudio: () => f.audio,
  });
  await session.start({
    ...DEFAULT_VOICE_AUDIO_PREFERENCES,
    inputDeviceId: "mic-1",
    outputDeviceId: "headphones",
  });
  assert.equal(captured, "mic-1");
  assert.equal(session.getSnapshot(), "listening");
  assert.equal(f.audio.srcObject, f.source.stream);
  assert.equal(f.counts().output, "headphones");
  assert.equal(f.counts().plays, 1);
  session.stop();
  session.stop();
  assert.equal(f.audio.srcObject, null);
  assert.equal(f.counts().stops, 1);
});

test("permission arriving after closing the tab cannot start playback or leak tracks", async () => {
  const f = fixture();
  let resolve!: (source: MicrophoneTestSource) => void;
  const session = new SelfMonitorSession({
    acquire: () =>
      new Promise((done) => {
        resolve = done;
      }),
    createAudio: () => f.audio,
  });
  const pending = session.start(DEFAULT_VOICE_AUDIO_PREFERENCES);
  session.stop();
  resolve(f.source);
  await pending;
  assert.equal(f.counts().stops, 1);
  assert.equal(f.counts().plays, 0);
  assert.equal(session.getSnapshot(), "idle");
});

test("output failure releases the microphone and does not silently play on another speaker", async () => {
  const f = fixture();
  f.audio.setSinkId = async () => {
    throw new Error("missing output");
  };
  const session = new SelfMonitorSession({
    acquire: async () => f.source,
    createAudio: () => f.audio,
  });
  await session.start(DEFAULT_VOICE_AUDIO_PREFERENCES);
  assert.equal(session.getSnapshot(), "output-error");
  assert.equal(f.counts().stops, 1);
  assert.equal(f.counts().plays, 0);
});

test("denied permission is reported and disconnecting a live device stops the preview", async () => {
  const denied = new SelfMonitorSession({
    acquire: async () => {
      throw new DOMException("denied", "NotAllowedError");
    },
  });
  await denied.start(DEFAULT_VOICE_AUDIO_PREFERENCES);
  assert.equal(denied.getSnapshot(), "denied");
  const f = fixture();
  const session = new SelfMonitorSession({
    acquire: async () => f.source,
    createAudio: () => f.audio,
  });
  await session.start(DEFAULT_VOICE_AUDIO_PREFERENCES);
  f.source.track.dispatchEvent(new Event("ended"));
  assert.equal(session.getSnapshot(), "unavailable");
  assert.equal(f.counts().stops, 1);
});

test("closing during output routing prevents late playback", async () => {
  const f = fixture();
  let routed!: () => void;
  f.audio.setSinkId = () =>
    new Promise((resolve) => {
      routed = resolve;
    });
  const session = new SelfMonitorSession({
    acquire: async () => f.source,
    createAudio: () => f.audio,
  });
  const pending = session.start(DEFAULT_VOICE_AUDIO_PREFERENCES);
  await Promise.resolve();
  session.stop();
  routed();
  await pending;
  assert.equal(f.counts().plays, 0);
  assert.equal(f.counts().stops, 1);
});

test("playback rejection releases the capture and a subsequent attempt can succeed", async () => {
  const first = fixture();
  const second = fixture();
  first.audio.play = async () => {
    throw new Error("playback failed");
  };
  let attempt = 0;
  const session = new SelfMonitorSession({
    acquire: async () => (++attempt === 1 ? first : second).source,
    createAudio: () => (attempt === 1 ? first : second).audio,
  });
  await session.start(DEFAULT_VOICE_AUDIO_PREFERENCES);
  assert.equal(session.getSnapshot(), "error");
  assert.equal(first.counts().stops, 1);
  await session.start(DEFAULT_VOICE_AUDIO_PREFERENCES);
  assert.equal(session.getSnapshot(), "listening");
  session.stop();
  assert.equal(second.counts().stops, 1);
});
