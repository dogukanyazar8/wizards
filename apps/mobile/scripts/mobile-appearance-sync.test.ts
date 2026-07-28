import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import type { MobileAccountAppearance } from "@wizards/types";
import {
  areMobileAppearancesEqual,
  createMobileAppearanceSyncQueue,
  resolveMobileAppearanceHydration,
} from "../src/account/mobile-appearance-sync";

const defaults: MobileAccountAppearance = {
  messageCompact: false,
  messageFollowSystemFont: false,
  messageFontSize: "medium",
};
const large: MobileAccountAppearance = { ...defaults, messageFontSize: "large" };
const xlarge: MobileAccountAppearance = { ...defaults, messageFontSize: "xlarge" };

describe("mobile appearance sync queue", () => {
  it("collapses a slider drag into one write", async () => {
    const writes: MobileAccountAppearance[] = [];
    const queue = createMobileAppearanceSyncQueue({
      delayMs: 5,
      write: async (appearance) => {
        writes.push(appearance);
      },
    });

    queue.queue(large);
    queue.queue(xlarge);
    queue.queue(defaults);
    await delay(25);

    assert.deepEqual(writes, [defaults]);
  });

  it("skips a repeat of the value the server already has", async () => {
    let writeCount = 0;
    const queue = createMobileAppearanceSyncQueue({
      delayMs: 1,
      write: async () => {
        writeCount += 1;
      },
    });

    queue.queue(large);
    await queue.flush();
    queue.queue(large);
    await queue.flush();

    assert.equal(writeCount, 1);
  });

  it("keeps a failed write from escaping to the caller and retries on the next change", async () => {
    const writes: MobileAccountAppearance[] = [];
    const queue = createMobileAppearanceSyncQueue({
      delayMs: 1,
      write: async (appearance) => {
        writes.push(appearance);
        if (writes.length === 1) {
          throw new Error("offline");
        }
      },
    });

    queue.queue(large);
    await queue.flush();
    queue.queue(large);
    await queue.flush();

    // The first attempt failed, so the same value is still worth sending.
    assert.deepEqual(writes, [large, large]);
  });

  it("cancels a pending write outright", async () => {
    let writeCount = 0;
    const queue = createMobileAppearanceSyncQueue({
      delayMs: 5,
      write: async () => {
        writeCount += 1;
      },
    });

    queue.queue(large);
    queue.cancel();
    await delay(25);

    assert.equal(writeCount, 0);
  });
});

describe("mobile appearance hydration", () => {
  it("waits for the stored preference before deciding anything", () => {
    assert.deepEqual(
      resolveMobileAppearanceHydration({
        hasHydrated: false,
        local: defaults,
        localReady: false,
        remote: large,
      }),
      { type: "idle" },
    );
  });

  it("adopts the server value when the device is still on the defaults", () => {
    assert.deepEqual(
      resolveMobileAppearanceHydration({
        hasHydrated: false,
        local: defaults,
        localReady: true,
        remote: large,
      }),
      { appearance: large, type: "adopt-remote" },
    );
  });

  it("uploads the device's own choice instead of resetting it", () => {
    assert.deepEqual(
      resolveMobileAppearanceHydration({
        hasHydrated: false,
        local: xlarge,
        localReady: true,
        remote: defaults,
      }),
      { appearance: xlarge, type: "push-local" },
    );
  });

  it("never reconciles twice in a session", () => {
    assert.deepEqual(
      resolveMobileAppearanceHydration({
        hasHydrated: true,
        local: defaults,
        localReady: true,
        remote: xlarge,
      }),
      { type: "idle" },
    );
  });

  it("does nothing when both sides already agree", () => {
    assert.deepEqual(
      resolveMobileAppearanceHydration({
        hasHydrated: false,
        local: large,
        localReady: true,
        remote: large,
      }),
      { type: "idle" },
    );
    assert.equal(areMobileAppearancesEqual(large, { ...large }), true);
    assert.equal(areMobileAppearancesEqual(large, xlarge), false);
  });
});
