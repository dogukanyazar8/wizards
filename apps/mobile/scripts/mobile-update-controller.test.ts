import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  MOBILE_UPDATE_CHECKING_FLOOR_MS,
  createExpoUpdateController,
  createFakeUpdateController,
  type MobileUpdateControllerDependencies,
  type MobileUpdateSnapshot,
} from "../src/about/mobile-update-controller";

/**
 * A hand-wound clock instead of `mock.timers`: the controller measures the
 * §4.3 floor with `now()` and burns it with `sleep()`, and both are injected
 * precisely so the test can advance time without a real 800 ms wait.
 */
function createHarness(overrides: Partial<MobileUpdateControllerDependencies> = {}) {
  let clock = 1_000;
  const sleeps: number[] = [];

  const deps: MobileUpdateControllerDependencies = {
    checkForUpdateAsync: async () => ({ isAvailable: false }),
    fetchUpdateAsync: async () => ({ isNew: true }),
    getNetwork: () => "wifi",
    isEnabled: true,
    now: () => clock,
    reloadAsync: async () => undefined,
    sleep: async (durationMs) => {
      sleeps.push(durationMs);
      clock += durationMs;
    },
    ...overrides,
  };

  return {
    advance: (ms: number) => {
      clock += ms;
    },
    controller: createExpoUpdateController(deps),
    sleeps,
  };
}

describe("mobile update controller", () => {
  it("reports what expo-updates actually supports", () => {
    const { controller } = createHarness();

    assert.deepEqual(controller.capabilities, {
      canPause: false,
      isEnabled: true,
      reportsPercent: false,
    });
  });

  it("holds the checking row for at least 800 ms after an instant answer", async () => {
    const { controller, sleeps } = createHarness();
    const states: string[] = [];
    controller.subscribe((snapshot) => states.push(snapshot.state));

    const state = await controller.check();

    assert.deepEqual(sleeps, [MOBILE_UPDATE_CHECKING_FLOOR_MS]);
    assert.deepEqual(states, ["checking", "current"]);
    assert.equal(state, "current");
  });

  it("does not add the floor on top of a check that was already slow", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const controller = createExpoUpdateController({
      checkForUpdateAsync: async () => {
        clock += 1_500;
        return { isAvailable: true };
      },
      isEnabled: true,
      now: () => clock,
      sleep: async (durationMs) => {
        sleeps.push(durationMs);
        clock += durationMs;
      },
    });

    assert.equal(await controller.check(), "available");
    assert.deepEqual(sleeps, [], "a 1.5 s check has already satisfied the 800 ms floor");
  });

  it("still lands on a state when the check throws", async () => {
    const { controller } = createHarness({
      checkForUpdateAsync: async () => {
        throw new Error("network down");
      },
    });

    assert.equal(await controller.check(), "failed");
    assert.equal(controller.getSnapshot().error, "check-failed");
    assert.notEqual(controller.getSnapshot().checkedAt, null);
  });

  it("never downloads or installs on a build where OTA is off", async () => {
    const fetchUpdateAsync = mock.fn(async () => ({ isNew: true }));
    const reloadAsync = mock.fn(async () => undefined);
    const { controller } = createHarness({ fetchUpdateAsync, isEnabled: false, reloadAsync });

    assert.equal(await controller.check(), "disabled");
    await controller.download();
    await controller.install();

    assert.equal(fetchUpdateAsync.mock.callCount(), 0);
    assert.equal(reloadAsync.mock.callCount(), 0);
    assert.equal(controller.capabilities.isEnabled, false);
    assert.equal(controller.getSnapshot().state, "disabled");
    assert.equal(controller.getSnapshot().error, "disabled");
  });

  it("never invents a percentage while downloading", async () => {
    const snapshots: MobileUpdateSnapshot[] = [];
    const { controller } = createHarness();
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    await controller.download();

    const progresses = snapshots.map((snapshot) => snapshot.progress).filter(Boolean);
    assert.ok(progresses.length > 0, "the download must report its step");
    for (const progress of progresses) {
      assert.equal(progress?.percent, null);
      assert.equal(progress?.downloadedBytes, null);
      assert.equal(progress?.totalBytes, null);
      assert.equal(progress?.etaSeconds, null);
    }
    assert.deepEqual(
      progresses.map((progress) => progress?.step),
      ["download", "verify"],
    );
    assert.equal(controller.getSnapshot().state, "ready");
  });

  it("marks a failed download instead of pretending it is ready", async () => {
    const { controller } = createHarness({
      fetchUpdateAsync: async () => {
        throw new Error("fetch failed");
      },
    });

    await controller.download();

    assert.equal(controller.getSnapshot().state, "failed");
    assert.equal(controller.getSnapshot().error, "download-failed");
    assert.equal(controller.getSnapshot().progress, null);
  });

  it("stops notifying an unsubscribed listener and keeps no reference to it", async () => {
    const { controller } = createHarness();
    const first: string[] = [];
    const second: string[] = [];

    const unsubscribe = controller.subscribe((snapshot) => first.push(snapshot.state));
    controller.subscribe((snapshot) => second.push(snapshot.state));

    unsubscribe();
    // Unsubscribing twice must not throw or remove the other listener.
    unsubscribe();
    await controller.check();

    assert.deepEqual(first, []);
    assert.deepEqual(second, ["checking", "current"]);
  });

  it("keeps the fake controller off the product path but honest about the floor", async () => {
    const controller = createFakeUpdateController({ updateAvailable: true });

    assert.equal(await controller.check(), "available");
    assert.equal(controller.getSnapshot().progress, null);

    const disabled = createFakeUpdateController({ isEnabled: false });
    assert.equal(await disabled.check(), "disabled");
    assert.equal(disabled.capabilities.reportsPercent, false);
  });
});
