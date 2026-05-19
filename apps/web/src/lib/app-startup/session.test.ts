import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getInitialShellSplashPhase,
  hasSeenShellStartupSplash,
  markShellStartupSplashSeen,
  resetShellStartupSplashSeenForTests,
} from "./session";

describe("app startup session state", () => {
  afterEach(() => {
    resetShellStartupSplashSeenForTests();
  });

  it("shows the shell splash on a fresh browser runtime", () => {
    assert.equal(hasSeenShellStartupSplash(), false);
    assert.equal(getInitialShellSplashPhase(), "showing");
  });

  it("dismisses repeated shell splash mounts within the same runtime", () => {
    markShellStartupSplashSeen();

    assert.equal(hasSeenShellStartupSplash(), true);
    assert.equal(getInitialShellSplashPhase(), "dismissed");
  });
});
