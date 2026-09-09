import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldUseSquareDesktopFrame } from "./desktop-window-frame-state";

describe("desktop window frame state", () => {
  it("keeps the native window rounded only in normal windowed mode", () => {
    assert.equal(shouldUseSquareDesktopFrame({ fullscreen: false, maximized: false }), false);
    assert.equal(shouldUseSquareDesktopFrame({ fullscreen: false, maximized: true }), true);
    assert.equal(shouldUseSquareDesktopFrame({ fullscreen: true, maximized: false }), true);
  });
});
