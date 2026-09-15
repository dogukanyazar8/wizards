import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopWindowControls } from "./desktop-window-controls";

describe("desktop window controls", () => {
  it("uses macOS order and accessible action labels, standard order elsewhere", () => {
    for (const platform of ["windows", "macos", "linux", "unknown"] as const) {
      const html = renderToStaticMarkup(
        <DesktopWindowControls
          platform={platform}
          maximized={false}
          labels={{ close: "Kapat", minimize: "Küçült", maximize: "Büyüt" }}
          onClose={() => {}}
          onMinimize={() => {}}
          onMaximize={() => {}}
        />,
      );
      const order = [...html.matchAll(/data-window-action="([^"]+)"/gu)].map((match) => match[1]);
      assert.deepEqual(
        order,
        platform === "macos"
          ? ["close", "minimize", "maximize"]
          : ["minimize", "maximize", "close"],
      );
      for (const label of ["Kapat", "Küçült", "Büyüt"])
        assert.ok(html.includes(`aria-label="${label}"`));
      assert.equal(html.includes("bg-[#ff5f57]"), platform === "macos");
    }
  });
});
