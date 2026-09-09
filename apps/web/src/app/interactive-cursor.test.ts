import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const globals = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");
const serverRail = readFileSync(
  fileURLToPath(new URL("../components/shell/server-rail.tsx", import.meta.url)),
  "utf8",
);

describe("uygulama geneli etkileşim imleci", () => {
  it("semantik bağlantı, düğme ve etkileşim rollerine pointer verir", () => {
    assert.match(globals, /a\[href\]/u);
    assert.match(globals, /button:not\(:disabled\)/u);
    assert.match(globals, /\[role="button"\]/u);
    assert.match(globals, /\[role="checkbox"\]/u);
    assert.match(globals, /summary/u);
    assert.match(globals, /cursor:\s*pointer/u);
  });

  it("pasif semantik kontrolleri pointer yapmaz", () => {
    assert.match(globals, /\[aria-disabled="true"\]/u);
    assert.match(globals, /cursor:\s*not-allowed/u);
  });

  it("sunucu rayı yalnız aktif sürüklemede grabbing, dinlenmede standart pointer kullanır", () => {
    assert.match(
      serverRail,
      /draggingServerId === server\.id \? "cursor-grabbing" : "cursor-pointer"/u,
    );
    assert.doesNotMatch(serverRail, /: "cursor-grab"/u);
  });
});
