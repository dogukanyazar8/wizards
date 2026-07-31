import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_EVENT_LOOP_SAMPLE_CAP,
  createMobileEventLoopLagMonitor,
} from "../src/performance/mobile-event-loop-lag";

function createFakeScheduler() {
  let nextId = 0;
  const tasks = new Map<number, () => void>();

  return {
    cancel(id: number) {
      tasks.delete(id);
    },
    flushOne() {
      const first = tasks.entries().next().value as [number, () => void] | undefined;
      assert.ok(first);
      tasks.delete(first[0]);
      first[1]();
    },
    pendingCount: () => tasks.size,
    schedule(callback: () => void) {
      nextId += 1;
      tasks.set(nextId, callback);
      return nextId;
    },
  };
}

describe("mobile event-loop lag monitor", () => {
  it("reports bounded p50/p95/max lag", () => {
    const scheduler = createFakeScheduler();
    let now = 0;
    const monitor = createMobileEventLoopLagMonitor({
      cancel: (timerId) => scheduler.cancel(timerId as unknown as number),
      intervalMs: 100,
      now: () => now,
      schedule: (callback) =>
        scheduler.schedule(callback) as unknown as ReturnType<typeof setTimeout>,
    });

    monitor.start();
    now = 110;
    scheduler.flushOne();
    now = 250;
    scheduler.flushOne();

    assert.deepEqual(monitor.snapshot(), { count: 2, maxMs: 40, p50Ms: 10, p95Ms: 40 });
  });

  it("stops background and unmount work without leaving a timer", () => {
    const scheduler = createFakeScheduler();
    const monitor = createMobileEventLoopLagMonitor({
      cancel: (timerId) => scheduler.cancel(timerId as unknown as number),
      intervalMs: 100,
      now: () => 0,
      schedule: (callback) =>
        scheduler.schedule(callback) as unknown as ReturnType<typeof setTimeout>,
    });

    monitor.start();
    assert.equal(scheduler.pendingCount(), 1);
    monitor.stop();
    assert.equal(scheduler.pendingCount(), 0);
    assert.equal(monitor.isRunning(), false);
  });

  it("drops oldest lag samples instead of growing", () => {
    const scheduler = createFakeScheduler();
    let now = 0;
    const monitor = createMobileEventLoopLagMonitor({
      cancel: (timerId) => scheduler.cancel(timerId as unknown as number),
      intervalMs: 1,
      now: () => now,
      schedule: (callback) =>
        scheduler.schedule(callback) as unknown as ReturnType<typeof setTimeout>,
    });
    monitor.start();

    for (let index = 0; index < MOBILE_EVENT_LOOP_SAMPLE_CAP + 5; index += 1) {
      now += 2;
      scheduler.flushOne();
    }

    assert.equal(monitor.snapshot().count, MOBILE_EVENT_LOOP_SAMPLE_CAP);
    monitor.stop();
  });
});
