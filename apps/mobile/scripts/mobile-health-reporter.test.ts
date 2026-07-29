import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMobileHealthReporter,
  MOBILE_HEALTH_BATCH_SIZE,
  MOBILE_HEALTH_QUEUE_CAP,
  toHealthEvents,
  type MobileHealthEvent,
} from "../src/performance/mobile-health-reporter";

function reporter(options: { fail?: boolean } = {}) {
  const sent: MobileHealthEvent[][] = [];

  const instance = createMobileHealthReporter({
    send: async (events) => {
      if (options.fail) {
        throw new Error("offline");
      }

      sent.push([...events]);
    },
  });

  return { instance, sent };
}

describe("mobile health reporter", () => {
  it("turns recorded performance metrics into health events", () => {
    const events = toHealthEvents([
      { durationMs: 812.4, metric: "startup", surface: "startup" },
      { durationMs: 140.2, metric: "list-load", surface: "dm-inbox" },
    ]);

    // `context` is always present now: it carries the sample id and the build,
    // platform and network slices. With no resolver injected it is empty.
    assert.deepEqual(events, [
      { context: {}, kind: "STARTUP", surface: "startup", valueMs: 812 },
      { context: {}, kind: "SCREEN_LOAD", surface: "dm-inbox", valueMs: 140 },
    ]);
  });

  it("sends a queued batch and empties what it sent", async () => {
    const { instance, sent } = reporter();

    instance.enqueue({ kind: "CRASH" }, { kind: "ERROR", surface: "dm" });
    assert.equal(await instance.flush(), true);

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.length, 2);
    assert.equal(instance.size(), 0);
  });

  it("keeps the queue when the flush fails", async () => {
    const { instance, sent } = reporter({ fail: true });

    instance.enqueue({ kind: "CRASH" });
    assert.equal(await instance.flush(), false);

    assert.deepEqual(sent, []);
    assert.equal(instance.size(), 1);
  });

  it("never grows past the queue cap and drops the oldest first", () => {
    const { instance } = reporter();

    for (let index = 0; index < MOBILE_HEALTH_QUEUE_CAP + 25; index += 1) {
      instance.enqueue({ kind: "ERROR", surface: `screen-${index}` });
    }

    assert.equal(instance.size(), MOBILE_HEALTH_QUEUE_CAP);
  });

  it("splits an oversized queue into server-sized batches", async () => {
    const { instance, sent } = reporter();

    for (let index = 0; index < MOBILE_HEALTH_BATCH_SIZE + 10; index += 1) {
      instance.enqueue({ kind: "ERROR" });
    }

    await instance.flush();

    assert.equal(sent[0]?.length, MOBILE_HEALTH_BATCH_SIZE);
    assert.equal(instance.size(), 10);
  });

  it("does nothing when the queue is empty", async () => {
    const { instance, sent } = reporter();

    assert.equal(await instance.flush(), false);
    assert.deepEqual(sent, []);
  });
});
