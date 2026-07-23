import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Sentry uses the supported debug logger tree-shaking option", () => {
  const source = readFileSync(fileURLToPath(new URL("../next.config.ts", import.meta.url)), "utf8");

  assert.doesNotMatch(source, /\bdisableLogger\s*:/u);
  assert.match(
    source,
    /webpack:\s*\{\s*treeshake:\s*\{\s*removeDebugLogging:\s*true[\s\S]*?\}\s*,?\s*\}/u,
  );
});
