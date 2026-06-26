import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAllowDesktopNativeContextMenu } from "./context-menu";

function closestTarget(matches: boolean) {
  return {
    closest: () => (matches ? {} : null),
  } as unknown as EventTarget;
}

describe("desktop context menu guard", () => {
  it("suppresses the native desktop context menu by default", () => {
    assert.equal(shouldAllowDesktopNativeContextMenu(null), false);
    assert.equal(shouldAllowDesktopNativeContextMenu(closestTarget(false)), false);
  });

  it("allows explicitly marked native context menu regions", () => {
    assert.equal(shouldAllowDesktopNativeContextMenu(closestTarget(true)), true);
  });

  it("resolves text-like targets through their parent element", () => {
    const target = {
      parentElement: closestTarget(true),
    } as unknown as EventTarget;

    assert.equal(shouldAllowDesktopNativeContextMenu(target), true);
  });
});
