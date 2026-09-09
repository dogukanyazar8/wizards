import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getWhisprDesktopNavigationPath,
  getWhisprDesktopBeforeCloseRequestId,
  isWhisprDesktopAutostartLaunch,
  setWhisprDesktopClientNavigationReady,
} from "./runtime";

describe("desktop runtime helpers", () => {
  it("recognises only the native autostart launch mode", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          __WHISPR_DESKTOP__: {
            launchMode: "autostart",
            platform: "tauri",
            shell: "desktop",
          },
        },
      });
      assert.equal(isWhisprDesktopAutostartLaunch(), true);

      window.__WHISPR_DESKTOP__ = {
        launchMode: "interactive",
        platform: "tauri",
        shell: "desktop",
      };
      assert.equal(isWhisprDesktopAutostartLaunch(), false);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "window", descriptor);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("accepts only positive safe integer close request ids", () => {
    assert.equal(
      getWhisprDesktopBeforeCloseRequestId(
        new CustomEvent("whispr:desktop-before-close", {
          detail: { requestId: 7 },
        }),
      ),
      7,
    );
    assert.equal(
      getWhisprDesktopBeforeCloseRequestId(
        new CustomEvent("whispr:desktop-before-close", {
          detail: { requestId: 0 },
        }),
      ),
      null,
    );
    assert.equal(
      getWhisprDesktopBeforeCloseRequestId(
        new CustomEvent("whispr:desktop-before-close", {
          detail: { requestId: Number.MAX_SAFE_INTEGER + 1 },
        }),
      ),
      null,
    );
    assert.equal(getWhisprDesktopBeforeCloseRequestId(new Event("x")), null);
  });

  it("publishes client-navigation readiness only for the active desktop listener", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const runtimeWindow = {
      __WHISPR_DESKTOP__: { platform: "tauri", shell: "desktop" },
    } as Window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: runtimeWindow,
    });

    try {
      setWhisprDesktopClientNavigationReady(true);
      assert.equal(runtimeWindow.__WHISPR_DESKTOP_CLIENT_NAVIGATION_READY__, true);

      setWhisprDesktopClientNavigationReady(false);
      assert.equal("__WHISPR_DESKTOP_CLIENT_NAVIGATION_READY__" in runtimeWindow, false);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "window", descriptor);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("accepts only safe navigate commands for the app-wide SPA bridge", () => {
    assert.equal(
      getWhisprDesktopNavigationPath(
        new CustomEvent("whispr:desktop-command", {
          detail: { command: "navigate", path: "/settings?section=desktop" },
        }),
      ),
      "/settings?section=desktop",
    );
    assert.equal(
      getWhisprDesktopNavigationPath(
        new CustomEvent("whispr:desktop-command", {
          detail: { command: "navigate", path: "https://attacker.example" },
        }),
      ),
      null,
    );
    assert.equal(
      getWhisprDesktopNavigationPath(
        new CustomEvent("whispr:desktop-command", {
          detail: { command: "toggle-mute", path: "/settings" },
        }),
      ),
      null,
    );
    assert.equal(
      getWhisprDesktopNavigationPath(
        new CustomEvent("whispr:desktop-command", {
          detail: { command: "navigate", path: `/${"a".repeat(767)}` },
        }),
      )?.length,
      768,
    );
    assert.equal(
      getWhisprDesktopNavigationPath(
        new CustomEvent("whispr:desktop-command", {
          detail: { command: "navigate", path: `/${"a".repeat(768)}` },
        }),
      ),
      null,
    );
  });
});
