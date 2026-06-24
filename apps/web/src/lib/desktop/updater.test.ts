import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  clearDismissedDesktopUpdateVersion,
  dismissDesktopUpdateVersion,
  getDismissedDesktopUpdateVersion,
  normalizeDesktopVersion,
} from "./updater";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

describe("desktop updater helpers", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("normalizes desktop versions for updater verification", () => {
    assert.equal(normalizeDesktopVersion("v0.8.14"), "0.8.14");
    assert.equal(normalizeDesktopVersion("  0.8.14  "), "0.8.14");
    assert.equal(normalizeDesktopVersion("v0.8.14-uat.1"), "0.8.14-uat.1");
    assert.equal(normalizeDesktopVersion(""), null);
    assert.equal(normalizeDesktopVersion(null), null);
  });

  it("stores and clears dismissed desktop update versions safely", () => {
    assert.equal(getDismissedDesktopUpdateVersion(), null);

    dismissDesktopUpdateVersion("0.8.14");
    assert.equal(getDismissedDesktopUpdateVersion(), "0.8.14");

    clearDismissedDesktopUpdateVersion("0.8.13");
    assert.equal(getDismissedDesktopUpdateVersion(), "0.8.14");

    clearDismissedDesktopUpdateVersion("0.8.14");
    assert.equal(getDismissedDesktopUpdateVersion(), null);
  });
});

function installMemoryLocalStorage() {
  const entries = new Map<string, string>();
  const localStorage = {
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  } satisfies Storage;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
    },
  });
}
