import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(import.meta.dirname, "..");

test("the app root is only wrapped after Sentry initializes", () => {
  const index = readFileSync(path.join(mobileRoot, "index.ts"), "utf8");

  assert.match(index, /const sentryInitialized = initMobileSentry\(\{/);
  assert.match(index, /registerRootComponent\(sentryInitialized \? wrapWithSentry\(App\) : App\)/);
});
