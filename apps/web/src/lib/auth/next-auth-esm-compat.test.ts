import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

test("loads next-auth through Node ESM", () => {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "await import('next-auth')"],
    {
      cwd: webRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
});
