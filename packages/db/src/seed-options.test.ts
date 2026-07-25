import assert from "node:assert/strict";
import test from "node:test";
import { readDemoSeedOptions } from "./seed-options";

test("requires an explicit non-empty demo seed password", () => {
  assert.throws(() => readDemoSeedOptions({}), /SEED_DEMO_PASSWORD/);
  assert.deepEqual(readDemoSeedOptions({ SEED_DEMO_PASSWORD: "LocalOnly!2026" }), {
    password: "LocalOnly!2026",
  });
});
