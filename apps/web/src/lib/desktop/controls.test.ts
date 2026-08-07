import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDesktopCompanionSurfaceReady,
  invokeDesktopControlSection,
  resolveDesktopGameOverlayHealth,
  type DesktopCompanionSurfaceInfo,
  type DesktopCompanionSurfacesStatus,
} from "@/lib/desktop/controls";

function surface(
  overrides: Partial<DesktopCompanionSurfaceInfo> = {},
): DesktopCompanionSurfaceInfo {
  return {
    exists: true,
    height: 320,
    minimized: false,
    visible: true,
    width: 320,
    x: 24,
    y: 24,
    ...overrides,
  };
}

function status(gameOverlay: DesktopCompanionSurfaceInfo): DesktopCompanionSurfacesStatus {
  return {
    gameOverlay,
    voiceMini: surface({ visible: false }),
  };
}

describe("desktop companion surface health", () => {
  it("treats a visible non-minimized companion window as ready", () => {
    assert.equal(isDesktopCompanionSurfaceReady(surface()), true);
    assert.equal(resolveDesktopGameOverlayHealth(status(surface()), true), "ready");
  });

  it("requests repair when the overlay is missing, hidden, minimized, or invalid-sized", () => {
    assert.equal(
      resolveDesktopGameOverlayHealth(status(surface({ exists: false })), true),
      "needs-repair",
    );
    assert.equal(
      resolveDesktopGameOverlayHealth(status(surface({ visible: false })), true),
      "needs-repair",
    );
    assert.equal(
      resolveDesktopGameOverlayHealth(status(surface({ minimized: true })), true),
      "needs-repair",
    );
    assert.equal(
      resolveDesktopGameOverlayHealth(status(surface({ width: 1 })), true),
      "needs-repair",
    );
  });

  it("stays idle when the overlay is not expected to be visible", () => {
    assert.equal(resolveDesktopGameOverlayHealth(null, false), "idle");
    assert.equal(
      resolveDesktopGameOverlayHealth(status(surface({ visible: false })), false),
      "idle",
    );
  });
});

describe("desktop control bridge", () => {
  it("invokes only the bounded local-control command with the requested section", async () => {
    const calls: Array<{
      args: Record<string, unknown> | undefined;
      command: string;
    }> = [];
    const result = await invokeDesktopControlSection("diagnostics", async (command, args) => {
      calls.push({ args, command });
      return true;
    });

    assert.equal(result, true);
    assert.deepEqual(calls, [
      { command: "show_desktop_control", args: { section: "diagnostics" } },
    ]);
  });
});
