import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_MOBILE_HAPTICS_ENABLED,
  loadMobileHapticsPreference,
  saveMobileHapticsPreference,
  shouldPerformMobileHaptic,
} from "../src/haptics/mobile-haptics-contract";

describe("mobile haptics contract", () => {
  it("respects both the user preference and reduced motion", () => {
    assert.equal(DEFAULT_MOBILE_HAPTICS_ENABLED, true);
    assert.equal(shouldPerformMobileHaptic({ preferenceEnabled: true, reduceMotion: false }), true);
    assert.equal(shouldPerformMobileHaptic({ preferenceEnabled: true, reduceMotion: true }), false);
    assert.equal(
      shouldPerformMobileHaptic({ preferenceEnabled: false, reduceMotion: false }),
      false,
    );
  });

  it("persists only normalized booleans", async () => {
    let stored: string | null = null;
    const storage = {
      getItemAsync: async () => stored,
      setItemAsync: async (_key: string, value: string) => {
        stored = value;
      },
    };
    assert.equal(await loadMobileHapticsPreference(storage), true);
    assert.equal(await saveMobileHapticsPreference(storage, false), false);
    assert.equal(await loadMobileHapticsPreference(storage), false);
  });
});
