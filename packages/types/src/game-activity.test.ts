import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("game catalog loads in native Node ESM without a TypeScript loader", () => {
  const moduleUrl = new URL("./game-activity.ts", import.meta.url).href;
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { GAME_CATALOG } from ${JSON.stringify(moduleUrl)};
       console.log(JSON.stringify(GAME_CATALOG.map((game) => game.id)));`,
    ],
    { encoding: "utf8", timeout: 10_000 },
  );
  const ids: string[] = JSON.parse(output);
  assert.ok(ids.includes("valorant"));
  assert.equal(new Set(ids).size, ids.length);
});
