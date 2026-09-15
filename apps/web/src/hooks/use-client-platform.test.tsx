import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { readClientPlatform, useClientPlatform } from "./use-client-platform";

describe("client platform", () => {
  it("keeps SSR neutral even when desktop metadata exists in the host", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          __WHISPR_DESKTOP__: { shell: "desktop", platform: "tauri", os: "macos" },
          navigator: { platform: "Win32", userAgent: "Windows NT 10.0", maxTouchPoints: 0 },
        },
      });
      assert.equal(readClientPlatform(), "macos");
      function Harness() {
        return <span>{useClientPlatform()}</span>;
      }
      assert.equal(renderToString(<Harness />), "<span>unknown</span>");
    } finally {
      if (original) Object.defineProperty(globalThis, "window", original);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
