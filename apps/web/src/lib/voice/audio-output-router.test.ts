import assert from "node:assert/strict";
import { it } from "node:test";
import { createAudioOutputRouter, type AudioOutputResult } from "./audio-output-router";

it("uses the system output after a removed speaker and reports the actual fallback", async () => {
  const calls: string[] = [];
  const results: AudioOutputResult[] = [];
  const router = createAudioOutputRouter(
    {
      setSinkId: async (id) => {
        calls.push(id);
        if (id) throw new DOMException("", "NotFoundError");
      },
    },
    (result) => results.push(result),
  );
  await router.select("removed-speaker");
  assert.deepEqual(calls, ["removed-speaker", ""]);
  assert.equal(results[0]?.status, "fallback");
});

it("does not treat a denied output permission as a missing speaker", async () => {
  let calls = 0;
  const results: AudioOutputResult[] = [];
  const router = createAudioOutputRouter(
    {
      setSinkId: async () => {
        calls++;
        throw new DOMException("", "NotAllowedError");
      },
    },
    (result) => results.push(result),
  );
  await router.select("speaker");
  assert.equal(calls, 1);
  assert.equal(results[0]?.status, "failed");
});

it("serializes changes and suppresses recovery from an obsolete selection", async () => {
  let rejectFirst!: (error: unknown) => void;
  const calls: string[] = [];
  const reports: string[] = [];
  const router = createAudioOutputRouter(
    {
      setSinkId: async (id) => {
        calls.push(id);
        if (id === "old")
          await new Promise<void>((_, reject) => {
            rejectFirst = reject;
          });
      },
    },
    (_, id) => reports.push(id),
  );
  const first = router.select("old");
  await Promise.resolve();
  const second = router.select("new");
  assert.deepEqual(calls, ["old"]);
  rejectFirst(new DOMException("", "NotFoundError"));
  await Promise.all([first, second]);
  assert.deepEqual(calls, ["old", "new"]);
  assert.deepEqual(reports, ["new"]);
});

it("does not recover or update settings after the audio element is detached", async () => {
  let rejectCapture!: (error: unknown) => void;
  let calls = 0;
  let reports = 0;
  const router = createAudioOutputRouter(
    {
      setSinkId: () => {
        calls++;
        return new Promise<void>((_, reject) => {
          rejectCapture = reject;
        });
      },
    },
    () => {
      reports++;
    },
  );
  const pending = router.select("speaker");
  await Promise.resolve();
  router.dispose();
  rejectCapture(new DOMException("", "NotFoundError"));
  await pending;
  assert.equal(calls, 1);
  assert.equal(reports, 0);
});

it("reports a failed fallback and keeps subsequent selections usable", async () => {
  const results: AudioOutputResult[] = [];
  let broken = true;
  const router = createAudioOutputRouter(
    {
      setSinkId: async () => {
        if (broken) throw new DOMException("", "AbortError");
      },
    },
    (result) => results.push(result),
  );
  await router.select("speaker");
  broken = false;
  await router.select("default");
  assert.deepEqual(
    results.map((r) => r.status),
    ["failed", "applied"],
  );
});

it("does not claim unsupported device selection succeeded", async () => {
  const results: AudioOutputResult[] = [];
  const router = createAudioOutputRouter({}, (result) => results.push(result));
  await router.select("speaker");
  await router.select("default");
  assert.deepEqual(
    results.map((r) => r.status),
    ["failed", "applied"],
  );
});
