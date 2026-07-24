import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("the @me parallel route provides a fallback without owning the /channels/@me URL", () => {
  assert.equal(existsSync(fileURLToPath(new URL("./default.tsx", import.meta.url))), true);
});
