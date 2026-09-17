import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createScreenShareHealthSampler,
  startScreenShareHealthPolling,
  type ScreenShareHealthSource,
} from "./screen-share-health-sampler";
import type { ScreenShareHealthSnapshot } from "@wizards/types";

it("samples immediately and every two seconds, then cancels the timer on cleanup", (context) => {
  context.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  const stop = startScreenShareHealthPolling(() => {
    calls += 1;
  });
  assert.equal(calls, 1);
  context.mock.timers.tick(1999);
  assert.equal(calls, 1);
  context.mock.timers.tick(1);
  assert.equal(calls, 2);
  stop();
  context.mock.timers.tick(10_000);
  assert.equal(calls, 2);
});

const report = (bytes = 1000) =>
  new Map([
    [
      "out",
      {
        type: "outbound-rtp",
        kind: "video",
        bytesSent: bytes,
        framesEncoded: bytes / 10,
        frameHeight: 1080,
        frameWidth: 1920,
        framesPerSecond: 30,
      },
    ],
  ]);

it("reports the first decoded frame once per receiver source", async () => {
  let frames = 0;
  let firstFrames = 0;
  const sampler = createScreenShareHealthSampler({
    onSample: () => {},
    onFirstDecodedFrame: () => {
      firstFrames += 1;
    },
  });
  const source = {
    identity: {},
    direction: "receive" as const,
    readStats: async () =>
      new Map([["in", { type: "inbound-rtp", kind: "video", framesDecoded: frames }]]),
  };
  await sampler.sample(source);
  assert.equal(firstFrames, 0);
  frames = 5;
  await sampler.sample(source);
  await sampler.sample(source);
  assert.equal(firstFrames, 1);
  await sampler.sample({ ...source, identity: {} });
  assert.equal(firstFrames, 2);
});

it("drops overlapping reads and ignores completion after stop", async () => {
  let resolve!: (value: ReturnType<typeof report>) => void;
  let calls = 0;
  const snapshots: (ScreenShareHealthSnapshot | null)[] = [];
  const source: ScreenShareHealthSource = {
    identity: {},
    direction: "send",
    readStats: () => {
      calls += 1;
      return new Promise((done) => {
        resolve = done;
      });
    },
  };
  const sampler = createScreenShareHealthSampler({ onSample: (value) => snapshots.push(value) });
  const pending = sampler.sample(source);
  await sampler.sample(source);
  assert.equal(calls, 1);
  sampler.stop();
  resolve(report());
  await pending;
  assert.deepEqual(snapshots, [null]);
});

it("resets counter baselines and closes the summary when the source changes", async () => {
  let now = 1000;
  let latest: ScreenShareHealthSnapshot | null = null;
  const phases: string[] = [];
  const sampler = createScreenShareHealthSampler({
    now: () => now,
    onSample: (value) => {
      latest = value;
    },
    onSummary: (events) => phases.push(...new Set(events.map((event) => event.context.phase))),
  });
  const identity = {};
  await sampler.sample({ identity, direction: "send", readStats: async () => report() });
  now += 2000;
  await sampler.sample({ identity, direction: "send", readStats: async () => report(3000) });
  assert.equal((latest as ScreenShareHealthSnapshot | null)?.bitrateKbps, 8);
  now += 2000;
  await sampler.sample({ identity: {}, direction: "send", readStats: async () => report(9000) });
  assert.equal((latest as ScreenShareHealthSnapshot | null)?.bitrateKbps, null);
  assert.deepEqual(phases, ["start", "end", "start"]);
  sampler.stop();
  assert.equal(latest, null);
});

it("clears stale measurements on a failed stats read and recovers on the next tick", async () => {
  let latest: ScreenShareHealthSnapshot | null = null;
  const sampler = createScreenShareHealthSampler({
    onSample: (value) => {
      latest = value;
    },
  });
  const source = { identity: {}, direction: "send" as const, readStats: async () => report() };
  await sampler.sample(source);
  await sampler.sample({
    ...source,
    readStats: async () => {
      throw new Error("track ended");
    },
  });
  assert.equal(latest, null);
  await sampler.sample(source);
  assert.ok(latest);
});
