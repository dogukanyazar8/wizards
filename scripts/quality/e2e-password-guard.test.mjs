import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const guardPath = join(root, "scripts", "quality", "e2e-password-guard.mjs");

test("E2E password guard flags only hardcoded fallback patterns", async (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "whispr-e2e-password-guard-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));

  const safePath = join(fixture, "safe.ts");
  const fallbackPath = join(fixture, "fallback.ts");
  const literalPath = join(fixture, "literal.ts");
  writeFileSync(safePath, "const password = env.E2E_TEST_PASSWORD?.trim();\n");
  writeFileSync(fallbackPath, "const password = env.E2E_TEST_PASSWORD ?? 'fallback';\n");
  writeFileSync(literalPath, "const password = 'WhisprE2E!2026';\n");

  const { findHardcodedPasswordFallbacks } = await import(pathToFileURL(guardPath).href);
  const violations = findHardcodedPasswordFallbacks({
    files: [safePath, fallbackPath, literalPath],
  });

  assert.deepEqual(
    violations.map((violation) => [violation.path, violation.rule]),
    [
      [fallbackPath, "E2E_TEST_PASSWORD fallback operator"],
      [literalPath, "deprecated E2E password literal"],
    ],
  );
});
