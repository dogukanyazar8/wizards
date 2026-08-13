import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { useLoginTheme } from "./use-login-theme";

function ThemeStateProbe() {
  const { theme } = useLoginTheme();
  return <div data-theme={theme} />;
}

describe("login theme hydration", () => {
  it("renders the same initial theme on the server and client", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

    try {
      Reflect.deleteProperty(globalThis, "window");
      const serverHtml = renderToString(<ThemeStateProbe />);

      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          localStorage: {
            getItem: () => "light",
          },
          matchMedia: () => ({ matches: true }),
        },
      });

      const clientHtml = renderToString(<ThemeStateProbe />);
      assert.equal(clientHtml, serverHtml);
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});
