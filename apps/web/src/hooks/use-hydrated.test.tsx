import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { useHydrated } from "@/hooks/use-hydrated";

test("useHydrated keeps the server render unhydrated", () => {
  function Probe() {
    return <span>{useHydrated() ? "client" : "server"}</span>;
  }

  assert.equal(renderToStaticMarkup(<Probe />), "<span>server</span>");
});
