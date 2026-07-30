import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { scheduleMobileIdleTask } from "../src/performance/mobile-idle-task";

const originalRequestIdleCallback = globalThis.requestIdleCallback;
const originalCancelIdleCallback = globalThis.cancelIdleCallback;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

afterEach(() => {
  globalThis.requestIdleCallback = originalRequestIdleCallback;
  globalThis.cancelIdleCallback = originalCancelIdleCallback;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

describe("mobile idle task", () => {
  it("cancels the exact pending idle callback", () => {
    let pending: IdleRequestCallback | null = null;
    const cancelledHandles: number[] = [];

    globalThis.requestIdleCallback = ((callback: IdleRequestCallback) => {
      pending = callback;
      return 17;
    }) as typeof requestIdleCallback;
    globalThis.cancelIdleCallback = ((handle: number) => {
      cancelledHandles.push(handle);
      pending = null;
    }) as typeof cancelIdleCallback;

    let ran = false;
    const handle = scheduleMobileIdleTask(() => {
      ran = true;
    });
    assert.notEqual(pending, null);

    handle.cancel();

    assert.deepEqual(cancelledHandles, [17]);
    assert.equal(pending, null);
    assert.equal(ran, false);
  });

  it("falls back to a cancellable timer when idle callbacks are unavailable", () => {
    let pending: (() => void) | null = null;
    const clearedHandles: Array<ReturnType<typeof setTimeout>> = [];

    globalThis.requestIdleCallback = undefined as unknown as typeof requestIdleCallback;
    globalThis.cancelIdleCallback = undefined as unknown as typeof cancelIdleCallback;
    globalThis.setTimeout = ((callback: () => void) => {
      pending = callback;
      return 23 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
      clearedHandles.push(handle);
      pending = null;
    }) as typeof clearTimeout;

    const handle = scheduleMobileIdleTask(() => undefined);

    assert.notEqual(pending, null);
    handle.cancel();
    assert.deepEqual(clearedHandles, [23]);
    assert.equal(pending, null);
  });
});
