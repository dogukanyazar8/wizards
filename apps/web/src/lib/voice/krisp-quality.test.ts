import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  getFallbackKrispQuality,
  getPreferredKrispQuality,
  shouldPrewarmKrispProcessor,
} from "./krisp-quality";

type NavigatorGlobal = typeof globalThis & {
  navigator?: Navigator;
};

const navigatorGlobal = globalThis as NavigatorGlobal;
const originalNavigator = navigatorGlobal.navigator;

afterEach(() => {
  if (originalNavigator === undefined) {
    Reflect.deleteProperty(navigatorGlobal, "navigator");
  } else {
    Object.defineProperty(navigatorGlobal, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

function setNavigator(value: Partial<Navigator>) {
  Object.defineProperty(navigatorGlobal, "navigator", {
    configurable: true,
    value,
  });
}

describe("Krisp quality selection", () => {
  it("starts high on capable desktop-like devices", () => {
    setNavigator({
      hardwareConcurrency: 8,
      maxTouchPoints: 0,
      deviceMemory: 8,
    } as Partial<Navigator> & { deviceMemory: number });

    assert.equal(getPreferredKrispQuality(), "high");
    assert.equal(shouldPrewarmKrispProcessor(), true);
  });

  it("steps down on constrained or touch-first devices", () => {
    setNavigator({
      hardwareConcurrency: 4,
      maxTouchPoints: 5,
      deviceMemory: 3,
    } as Partial<Navigator> & { deviceMemory: number });

    assert.equal(getPreferredKrispQuality(), "medium");
    assert.equal(shouldPrewarmKrispProcessor(), false);
  });

  it("uses low quality on very constrained devices", () => {
    setNavigator({
      hardwareConcurrency: 2,
      maxTouchPoints: 0,
      deviceMemory: 1,
    } as Partial<Navigator> & { deviceMemory: number });

    assert.equal(getPreferredKrispQuality(), "low");
    assert.equal(shouldPrewarmKrispProcessor(), false);
  });

  it("keeps fallback quality bounded", () => {
    assert.equal(getFallbackKrispQuality("high"), "medium");
    assert.equal(getFallbackKrispQuality("medium"), "low");
    assert.equal(getFallbackKrispQuality("low"), null);
  });
});
