import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { GameActivityUpdateSchema, GameIdSchema, GAME_CATALOG } from "./game-activity";

test("registered game ids accept only deterministic hashes and require a label", () => {
  const sessionId = "00000000-0000-4000-8000-000000000001";
  assert.equal(GameIdSchema.safeParse("custom:abcdef123456").success, true);
  assert.equal(GameIdSchema.safeParse("custom:../../secret").success, false);
  assert.equal(
    GameActivityUpdateSchema.safeParse({ gameId: "custom:abcdef123456", sessionId }).success,
    false,
  );
  assert.equal(
    GameActivityUpdateSchema.safeParse({
      gameId: "custom:abcdef123456",
      sessionId,
      label: "My game",
    }).success,
    true,
  );
  assert.equal(
    GameActivityUpdateSchema.safeParse({
      gameId: "custom:abcdef123456",
      sessionId,
      label: "\u200b",
    }).success,
    false,
  );
});

test("catalog owns ids and excludes duplicate executables and launchers", () => {
  const executables = GAME_CATALOG.flatMap((game) => game.executables);
  assert.equal(new Set(executables).size, executables.length);
  for (const game of GAME_CATALOG) assert.equal(GameIdSchema.parse(game.id), game.id);
  for (const exe of executables) {
    assert.equal(exe, exe.toLowerCase());
    assert.ok(
      ![
        "steam.exe",
        "riotclientservices.exe",
        "epicgameslauncher.exe",
        "battle.net.exe",
        "eadesktop.exe",
        "upc.exe",
      ].includes(exe),
    );
  }
});

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
