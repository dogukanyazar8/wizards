import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOBILE_PRELOADED_TABS, preloadMobileTabs } from "../src/navigation/mobile-tab-preload";

function createNavigation() {
  const preloaded: string[] = [];
  return {
    navigation: {
      preload: (name: string) => {
        preloaded.push(name);
      },
    },
    preloaded,
  };
}

describe("preloadMobileTabs", () => {
  it("mounts the configured tabs off the first visit's critical path", () => {
    const { navigation, preloaded } = createNavigation();

    const result = preloadMobileTabs(navigation, "overview");

    assert.deepEqual(preloaded, [...MOBILE_PRELOADED_TABS]);
    assert.deepEqual(result, [...MOBILE_PRELOADED_TABS]);
  });

  it("skips the tab the reader is already on", () => {
    const { navigation, preloaded } = createNavigation();

    const result = preloadMobileTabs(navigation, "messages");

    assert.deepEqual(preloaded, []);
    assert.deepEqual(result, []);
  });

  it("stays inert when the navigator cannot preload", () => {
    const result = preloadMobileTabs({}, "overview");

    assert.deepEqual(result, []);
  });

  it("reports the tab it could not preload rather than throwing", () => {
    const result = preloadMobileTabs(
      {
        preload: () => {
          throw new Error("navigator not ready");
        },
      },
      "overview",
    );

    assert.deepEqual(result, []);
  });
});
