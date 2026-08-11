import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const layoutSource = readFileSync(join(appDirectory, "layout.tsx"), "utf8");

test("root layout uses repository-local fonts so production builds do not require network", () => {
  assert.doesNotMatch(layoutSource, /next\/font\/google/u);
  assert.match(layoutSource, /next\/font\/local/u);

  for (const filename of [
    "dm-sans-latin.woff2",
    "inter-latin.woff2",
    "open-sans-latin.woff2",
    "outfit-latin.woff2",
    "plus-jakarta-sans-latin.woff2",
    "raleway-latin.woff2",
    "space-grotesk-latin.woff2",
  ]) {
    assert.ok(existsSync(join(appDirectory, "fonts", filename)), `${filename} must be vendored`);
  }
});
