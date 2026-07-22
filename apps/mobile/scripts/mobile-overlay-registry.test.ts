import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  createMobileOverlayRegistry,
  type MobileOverlayRegistry,
} from "../src/app/components/kit/overlay-registry";

const noop = () => undefined;

function entry(id: string, node: string, onClose: () => void = noop) {
  return { id, node, onClose };
}

describe("mobile overlay registry", () => {
  let registry: MobileOverlayRegistry;
  let notifications: number;
  let hostNotifications: number;

  beforeEach(() => {
    registry = createMobileOverlayRegistry();
    notifications = 0;
    hostNotifications = 0;
    registry.subscribe(() => {
      notifications += 1;
    });
    registry.subscribeHost(() => {
      hostNotifications += 1;
    });
  });

  it("starts empty and hands out a stable snapshot reference", () => {
    assert.deepEqual(registry.getEntries(), []);
    assert.equal(registry.getTopEntry(), null);
    assert.equal(registry.hasHost(), false);
    // useSyncExternalStore re-renders forever if the empty snapshot is new
    // every read.
    assert.equal(registry.getEntries(), registry.getEntries());
  });

  it("keeps mount order as z-order and reports the last entry as the top", () => {
    registry.set(entry("sheet", "sheet-node"));
    registry.set(entry("menu", "menu-node"));

    assert.deepEqual(
      registry.getEntries().map((candidate) => candidate.id),
      ["sheet", "menu"],
    );
    assert.equal(registry.getTopEntry()?.id, "menu");
    assert.equal(notifications, 2);
  });

  it("replaces a known id in place so a re-render keeps its stacking position", () => {
    registry.set(entry("sheet", "first"));
    registry.set(entry("menu", "menu-node"));
    registry.set(entry("sheet", "second"));

    assert.deepEqual(
      registry.getEntries().map((candidate) => candidate.id),
      ["sheet", "menu"],
    );
    assert.equal(registry.getEntries()[0]?.node, "second");
    assert.equal(registry.getTopEntry()?.id, "menu");
  });

  it("ignores an identical re-registration so the host stays out of that render", () => {
    const onClose = () => undefined;
    registry.set(entry("sheet", "node", onClose));
    const snapshot = registry.getEntries();

    registry.set(entry("sheet", "node", onClose));

    assert.equal(registry.getEntries(), snapshot);
    assert.equal(notifications, 1);
  });

  it("uncovers the overlay below when the top one is removed", () => {
    registry.set(entry("sheet", "sheet-node"));
    registry.set(entry("menu", "menu-node"));

    registry.remove("menu");

    assert.equal(registry.getTopEntry()?.id, "sheet");
    registry.remove("sheet");
    assert.equal(registry.getTopEntry(), null);
    assert.deepEqual(registry.getEntries(), []);
  });

  it("does not notify when removing an id it never held", () => {
    registry.set(entry("sheet", "sheet-node"));
    notifications = 0;

    registry.remove("nothing-here");

    assert.equal(notifications, 0);
    assert.equal(registry.getEntries().length, 1);
  });

  it("lets a closing overlay and its replacement overlap", () => {
    // Action menu closes (200ms exit) while the emoji sheet is already opening:
    // both are registered, the newcomer on top, and the exit removes only
    // itself once its animation lands.
    registry.set(entry("menu", "menu-node"));
    registry.set(entry("emoji-sheet", "emoji-node"));

    assert.deepEqual(
      registry.getEntries().map((candidate) => candidate.id),
      ["menu", "emoji-sheet"],
    );

    registry.remove("menu");

    assert.deepEqual(
      registry.getEntries().map((candidate) => candidate.id),
      ["emoji-sheet"],
    );
    assert.equal(registry.getTopEntry()?.id, "emoji-sheet");
  });

  it("tracks host presence and releases it exactly once", () => {
    const unmount = registry.mountHost();
    assert.equal(registry.hasHost(), true);
    assert.equal(hostNotifications, 1);

    unmount();
    unmount();

    assert.equal(registry.hasHost(), false);
    assert.equal(hostNotifications, 2);
  });

  it("stops notifying an unsubscribed listener", () => {
    let calls = 0;
    const unsubscribe = registry.subscribe(() => {
      calls += 1;
    });

    registry.set(entry("sheet", "sheet-node"));
    unsubscribe();
    registry.set(entry("menu", "menu-node"));

    assert.equal(calls, 1);
  });

  it("resets entries and host presence together", () => {
    registry.mountHost();
    registry.set(entry("sheet", "sheet-node"));

    registry.reset();

    assert.deepEqual(registry.getEntries(), []);
    assert.equal(registry.hasHost(), false);
  });
});
