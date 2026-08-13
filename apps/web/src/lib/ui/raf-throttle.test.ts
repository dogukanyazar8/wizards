import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRafThrottledCallback } from "./raf-throttle";

describe("createRafThrottledCallback", () => {
  it("coalesces repeated events into one frame using the latest arguments", () => {
    const frames: Array<() => void> = [];
    const values: number[] = [];
    const throttled = createRafThrottledCallback((value: number) => values.push(value), {
      cancelFrame: () => undefined,
      requestFrame: (callback) => {
        frames.push(callback);
        return 7;
      },
    });

    throttled.run(1);
    throttled.run(2);
    throttled.run(3);

    assert.equal(frames.length, 1);
    assert.deepEqual(values, []);

    frames[0]?.();
    assert.deepEqual(values, [3]);
  });
});
