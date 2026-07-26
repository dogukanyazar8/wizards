import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_UPLOAD_CEILING_MS,
  MOBILE_UPLOAD_FINALIZE_TIMEOUT_MS,
  MOBILE_UPLOAD_FIRST_BYTE_TIMEOUT_MS,
  MOBILE_UPLOAD_STALL_TIMEOUT_MS,
  createMobileUploadWatchdog,
  type MobileUploadStage,
} from "../src/media/mobile-upload-watchdog";

/** A hand-driven clock: timers only fire when the test advances time. */
function createTestClock() {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; run: () => void }>();

  return {
    advance(milliseconds: number) {
      const target = now + milliseconds;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) {
          break;
        }
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = target;
    },
    clearTimer(handle: number) {
      timers.delete(handle);
    },
    get pending() {
      return timers.size;
    },
    setTimer(run: () => void, milliseconds: number) {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, { at: now + milliseconds, run });
      return handle;
    },
  };
}

function createWatchdog() {
  const clock = createTestClock();
  const expirations: MobileUploadStage[] = [];
  const watchdog = createMobileUploadWatchdog({
    clearTimer: (handle) => clock.clearTimer(handle as number),
    onExpire: (stage) => expirations.push(stage),
    setTimer: (run, milliseconds) => clock.setTimer(run, milliseconds),
  });

  return { clock, expirations, watchdog };
}

describe("mobile upload watchdog", () => {
  it("starts out waiting for the first byte, not for the whole upload", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    assert.equal(watchdog.stage, "preparing");
    // The most forgiving budget of the three: a runtime that never reports
    // progress spends the whole upload here, so it must not be the strictest.
    assert.ok(MOBILE_UPLOAD_FIRST_BYTE_TIMEOUT_MS > MOBILE_UPLOAD_STALL_TIMEOUT_MS);
    clock.advance(MOBILE_UPLOAD_FIRST_BYTE_TIMEOUT_MS - 1);
    assert.deepEqual(expirations, []);

    clock.advance(1);
    assert.deepEqual(expirations, ["preparing"]);
  });

  /**
   * The single flat deadline this replaces killed uploads that were still
   * moving: a large screenshot on a slow uplink is not a stalled request.
   */
  it("never expires while bytes are still moving", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    for (let sent = 1; sent <= 5; sent += 1) {
      clock.advance(MOBILE_UPLOAD_STALL_TIMEOUT_MS - 1_000);
      watchdog.progress({ loaded: sent * 100_000, total: 4_000_000 });
      assert.equal(watchdog.stage, "transferring");
    }

    assert.deepEqual(expirations, []);
  });

  it("gives up when a transfer that started stops moving", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    watchdog.progress({ loaded: 100_000, total: 4_000_000 });
    clock.advance(MOBILE_UPLOAD_STALL_TIMEOUT_MS - 1);
    assert.deepEqual(expirations, []);

    clock.advance(1);
    assert.deepEqual(expirations, ["transferring"]);
  });

  /**
   * The last byte does not end the request: UploadThing holds the response open
   * until our own onUploadComplete answers, so the tail is server work and
   * deserves its own, longer budget.
   */
  it("switches to a longer budget once the last byte is sent", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    watchdog.progress({ loaded: 4_000_000, total: 4_000_000 });
    assert.equal(watchdog.stage, "finalizing");

    clock.advance(MOBILE_UPLOAD_STALL_TIMEOUT_MS + 1);
    assert.deepEqual(expirations, []);

    clock.advance(MOBILE_UPLOAD_FINALIZE_TIMEOUT_MS - MOBILE_UPLOAD_STALL_TIMEOUT_MS - 1);
    // The finalize budget is measured from the last byte, not from the start.
    assert.deepEqual(expirations, ["finalizing"]);
  });

  it("keeps the finalize deadline fixed instead of extending it on repeats", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    watchdog.progress({ loaded: 4_000_000, total: 4_000_000 });
    clock.advance(MOBILE_UPLOAD_FINALIZE_TIMEOUT_MS - 1_000);
    watchdog.progress({ loaded: 4_000_000, total: 4_000_000 });

    clock.advance(1_000);
    assert.deepEqual(expirations, ["finalizing"]);
  });

  it("holds a ceiling over the whole attempt so progress cannot stall forever", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    for (let elapsed = 0; elapsed < MOBILE_UPLOAD_CEILING_MS; elapsed += 5_000) {
      clock.advance(5_000);
      watchdog.progress({ loaded: elapsed, total: Number.MAX_SAFE_INTEGER });
    }

    assert.deepEqual(expirations, ["transferring"]);
  });

  it("reports one expiry only, and none once it is stopped", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    watchdog.stop();
    clock.advance(MOBILE_UPLOAD_CEILING_MS * 2);

    assert.deepEqual(expirations, []);
    assert.equal(clock.pending, 0);
  });

  it("ignores a progress report with no total to compare against", () => {
    const { clock, expirations, watchdog } = createWatchdog();

    watchdog.progress({ loaded: 10, total: 0 });
    assert.equal(watchdog.stage, "transferring");

    clock.advance(MOBILE_UPLOAD_STALL_TIMEOUT_MS);
    assert.deepEqual(expirations, ["transferring"]);
  });
});
