import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FOCUS_COUNTDOWN_TICK_MS,
  createFocusCountdown,
  getFocusMinutesLeft,
} from "@/lib/home/focus-countdown";

/**
 * `06-faz5` §3.2 and §9. The countdown is an absolute-deadline reader, not a
 * seconds counter, and it has to prove three things a component test could not:
 * it ticks once a minute, it lets go of its interval, and a hidden tab does not
 * accumulate lost minutes.
 *
 * The engine takes its timer and its visibility source as parameters, so this
 * file drives it with a fake clock and no DOM at all.
 */

const EXPIRES_AT = Date.parse("2026-08-19T12:25:00.000Z");

function fakeEnvironment(startMs: number) {
  let now = startMs;
  let nextHandle = 1;
  let hidden = false;
  const intervals = new Map<number, { intervalMs: number; run: () => void }>();
  const visibilityListeners = new Set<() => void>();

  return {
    /** Walks the clock in one-second steps so each tick reads the time it fired at. */
    advance(ms: number) {
      const stepMs = 1_000;
      const elapsedByHandle = new Map<number, number>();
      let remaining = ms;

      while (remaining > 0) {
        const delta = Math.min(stepMs, remaining);
        now += delta;
        remaining -= delta;

        for (const [handle, entry] of [...intervals]) {
          const elapsed = (elapsedByHandle.get(handle) ?? 0) + delta;

          if (elapsed >= entry.intervalMs) {
            elapsedByHandle.set(handle, elapsed - entry.intervalMs);
            entry.run();
          } else {
            elapsedByHandle.set(handle, elapsed);
          }
        }
      }
    },
    get liveIntervalCount() {
      return intervals.size;
    },
    setHidden(value: boolean) {
      hidden = value;
      for (const listener of visibilityListeners) {
        listener();
      }
    },
    options: {
      clearInterval: (handle: number) => {
        intervals.delete(handle);
      },
      isHidden: () => hidden,
      now: () => now,
      setInterval: (run: () => void, intervalMs: number) => {
        const handle = nextHandle;
        nextHandle += 1;
        intervals.set(handle, { intervalMs, run });
        return handle;
      },
      subscribeVisibility: (listener: () => void) => {
        visibilityListeners.add(listener);
        return () => visibilityListeners.delete(listener);
      },
    },
    get visibilityListenerCount() {
      return visibilityListeners.size;
    },
  };
}

describe("getFocusMinutesLeft", () => {
  it("rounds up, so the last partial minute still reads as one", () => {
    assert.equal(getFocusMinutesLeft(EXPIRES_AT, EXPIRES_AT - 25 * 60_000), 25);
    assert.equal(getFocusMinutesLeft(EXPIRES_AT, EXPIRES_AT - 60_001), 2);
    assert.equal(getFocusMinutesLeft(EXPIRES_AT, EXPIRES_AT - 1_000), 1);
  });

  it("clamps at zero and never goes negative", () => {
    assert.equal(getFocusMinutesLeft(EXPIRES_AT, EXPIRES_AT), 0);
    assert.equal(getFocusMinutesLeft(EXPIRES_AT, EXPIRES_AT + 10 * 60_000), 0);
  });

  it("reads an unparseable or absent deadline as no window", () => {
    assert.equal(getFocusMinutesLeft(null, EXPIRES_AT), null);
    assert.equal(getFocusMinutesLeft(Number.NaN, EXPIRES_AT), null);
  });
});

describe("createFocusCountdown", () => {
  it("ticks once a minute", () => {
    const environment = fakeEnvironment(EXPIRES_AT - 25 * 60_000);
    const seen: (number | null)[] = [];
    const countdown = createFocusCountdown({
      ...environment.options,
      expiresAtMs: EXPIRES_AT,
      onTick: (minutesLeft) => seen.push(minutesLeft),
    });

    assert.equal(countdown.read(), 25);
    environment.advance(FOCUS_COUNTDOWN_TICK_MS * 3);

    assert.deepEqual(seen, [24, 23, 22]);
    countdown.destroy();
  });

  it("leaves no interval and no listener behind on destroy", () => {
    const environment = fakeEnvironment(EXPIRES_AT - 25 * 60_000);
    const countdown = createFocusCountdown({
      ...environment.options,
      expiresAtMs: EXPIRES_AT,
      onTick: () => undefined,
    });

    assert.equal(environment.liveIntervalCount, 1);
    assert.equal(environment.visibilityListenerCount, 1);

    countdown.destroy();

    assert.equal(environment.liveIntervalCount, 0);
    assert.equal(environment.visibilityListenerCount, 0);
  });

  it("stops ticking while the tab is hidden and recomputes from the deadline on return", () => {
    const environment = fakeEnvironment(EXPIRES_AT - 25 * 60_000);
    const seen: (number | null)[] = [];
    const countdown = createFocusCountdown({
      ...environment.options,
      expiresAtMs: EXPIRES_AT,
      onTick: (minutesLeft) => seen.push(minutesLeft),
    });

    environment.setHidden(true);
    assert.equal(environment.liveIntervalCount, 0, "hidden tab keeps no timer alive");

    // A ten minute sleep. A seconds counter would come back reading 25.
    environment.advance(10 * FOCUS_COUNTDOWN_TICK_MS);
    assert.deepEqual(seen, [], "nothing ticks while hidden");

    environment.setHidden(false);

    assert.equal(countdown.read(), 15);
    assert.deepEqual(seen, [15], "returning republishes the value read off the deadline");
    assert.equal(environment.liveIntervalCount, 1, "the timer comes back with the tab");

    countdown.destroy();
  });

  it("stops at zero and does not keep an interval running past the deadline", () => {
    const environment = fakeEnvironment(EXPIRES_AT - 2 * 60_000);
    const seen: (number | null)[] = [];
    const countdown = createFocusCountdown({
      ...environment.options,
      expiresAtMs: EXPIRES_AT,
      onTick: (minutesLeft) => seen.push(minutesLeft),
    });

    environment.advance(FOCUS_COUNTDOWN_TICK_MS * 3);

    assert.deepEqual(seen, [1, 0]);
    assert.equal(environment.liveIntervalCount, 0, "an elapsed window releases its timer");

    countdown.destroy();
  });

  it("never starts a timer without a deadline", () => {
    const environment = fakeEnvironment(EXPIRES_AT);
    const countdown = createFocusCountdown({
      ...environment.options,
      expiresAtMs: null,
      onTick: () => undefined,
    });

    assert.equal(countdown.read(), null);
    assert.equal(environment.liveIntervalCount, 0);

    countdown.destroy();
  });
});
