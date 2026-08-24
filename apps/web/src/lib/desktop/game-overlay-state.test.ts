import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDesktopGameOverlayOperationInFlight,
  transitionDesktopGameOverlayState,
} from "@/lib/desktop/game-overlay-state";

describe("desktop game overlay state machine", () => {
  it("moves through show, visible, repair, and hide states explicitly", () => {
    assert.equal(
      transitionDesktopGameOverlayState("hidden", { type: "show-requested" }),
      "preparing",
    );
    assert.equal(
      transitionDesktopGameOverlayState("preparing", { type: "show-succeeded" }),
      "visible",
    );
    assert.equal(
      transitionDesktopGameOverlayState("visible", { type: "repair-requested" }),
      "repairing",
    );
    assert.equal(
      transitionDesktopGameOverlayState("repairing", { type: "repair-succeeded" }),
      "visible",
    );
    assert.equal(transitionDesktopGameOverlayState("visible", { type: "hide" }), "hidden");
  });

  it("treats failed and in-flight states separately", () => {
    assert.equal(transitionDesktopGameOverlayState("preparing", { type: "show-failed" }), "failed");
    assert.equal(
      transitionDesktopGameOverlayState("repairing", { type: "repair-failed" }),
      "failed",
    );
    assert.equal(isDesktopGameOverlayOperationInFlight("preparing"), true);
    assert.equal(isDesktopGameOverlayOperationInFlight("repairing"), true);
    assert.equal(isDesktopGameOverlayOperationInFlight("visible"), false);
  });

  it("does not start a repair cycle while explicitly hidden", () => {
    assert.equal(
      transitionDesktopGameOverlayState("hidden", { type: "repair-requested" }),
      "hidden",
    );
    assert.equal(transitionDesktopGameOverlayState("hidden", { type: "repair-failed" }), "hidden");
  });
});
