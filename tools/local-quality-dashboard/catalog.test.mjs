import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("catalog exposes approved suites without executable arguments", async () => {
  const catalog = await loadCatalog({ root });

  assert.deepEqual(catalog.suites.safeAll, ["Standard", "CI", "Mobile", "Security", "Desktop"]);
  assert.deepEqual(catalog.suites.fullAcceptance, ["E2EFull", "MobileRelease"]);
  assert.equal(catalog.profiles.Desktop.steps[0].id, "desktop-script-tests");
  assert.equal(catalog.profiles.Desktop.steps[0].executable, undefined);
  assert.equal(catalog.profiles.Desktop.steps[0].arguments, undefined);
  assert.equal(catalog.profiles.E2EFull.destructive, true);
});

test("catalog rejects unknown schema and malformed profiles", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "whispr-quality-catalog-"));
  try {
    const registryPath = join(fixtureRoot, "scripts", "quality", "local-gate-profiles.json");
    await mkdir(dirname(registryPath), { recursive: true });
    await writeFile(registryPath, JSON.stringify({ schemaVersion: 2, profiles: {} }), "utf8");
    await assert.rejects(() => loadCatalog({ root: fixtureRoot }), /schema version/u);

    await writeFile(
      registryPath,
      JSON.stringify({ schemaVersion: 1, profiles: { Fast: { description: "Fast" } } }),
      "utf8",
    );
    await assert.rejects(() => loadCatalog({ root: fixtureRoot }), /profile registry/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
