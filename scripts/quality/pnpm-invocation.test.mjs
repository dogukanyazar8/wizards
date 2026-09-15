import assert from "node:assert/strict";
import test from "node:test";
import { pnpmInvocation } from "./pnpm-invocation.mjs";

for (const extension of ["cjs", "mjs", "js"]) {
  test(`runs the ${extension} launcher with Node and preserves argument boundaries`, () => {
    const cli = `C:/Package Managers/pnpm.${extension}`;
    assert.deepEqual(pnpmInvocation(cli, ["exec", "a b", "$(literal)"], "node"), {
      command: "node",
      args: [cli, "exec", "a b", "$(literal)"],
    });
  });
}

for (const cli of ["C:/Package Managers/pnpm.exe", "/opt/pnpm/pnpm"]) {
  test(`runs native pnpm directly: ${cli}`, () => {
    assert.deepEqual(pnpmInvocation(cli, ["exec", "tsc"]), {
      command: cli,
      args: ["exec", "tsc"],
    });
  });
}

test("fails closed without a pnpm-provided launcher", () => {
  assert.throws(() => pnpmInvocation(undefined, []), /must be launched through pnpm/);
});
