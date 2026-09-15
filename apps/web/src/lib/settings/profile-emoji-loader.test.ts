import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { loadProfileEmojiCatalog } from "./profile-emoji-catalog";

const originalWorker = globalThis.Worker;
const instances: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor() {
    instances.push(this);
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  globalThis.Worker = originalWorker;
});

it("builds off the UI thread, shares concurrent opens and retries a failed worker", async () => {
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
  const first = loadProfileEmojiCatalog();
  assert.equal(loadProfileEmojiCatalog(), first);
  assert.equal(instances.length, 1, "catalog construction must run in a worker");
  const failure = assert.rejects(first);
  instances[0]!.onerror?.({ preventDefault() {} } as ErrorEvent);
  await failure;
  assert.equal(instances[0]!.terminated, true);

  const retry = loadProfileEmojiCatalog();
  assert.equal(instances.length, 2);
  const entries = [
    { native: "😀", name: "Grinning Face", keywords: "grinning 😀", category: "people" },
  ];
  instances[1]!.onmessage?.({ data: entries } as MessageEvent);
  assert.deepEqual(await retry, entries);
  assert.equal(instances[1]!.terminated, true);
  assert.equal(await loadProfileEmojiCatalog(), entries);
  assert.equal(instances.length, 2, "reopening must reuse the ready catalog");
});
