import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { useAppShortcutLabel } from "./use-app-shortcut-label";

describe("useAppShortcutLabel", () => {
  it("uses the Windows/Linux label for the server snapshot", () => {
    function Harness() {
      return <span>{useAppShortcutLabel("chat.search")}</span>;
    }

    assert.equal(renderToString(<Harness />), "<span>Ctrl+F</span>");
  });
});
