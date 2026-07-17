import assert from "node:assert/strict";
import test from "node:test";
import { compareDeclarationMaps, normalizeDeclaration } from "./typescript-declaration-parity.mjs";

test("declaration normalization removes line-ending noise only", () => {
  assert.equal(normalizeDeclaration("export type A = 1;\r\n"), "export type A = 1;\n");
});

test("declaration comparison classifies missing, extra, and changed output", () => {
  const stable = new Map([
    ["same.d.ts", "same\n"],
    ["changed.d.ts", "stable\n"],
    ["missing.d.ts", "missing\n"],
  ]);
  const native = new Map([
    ["same.d.ts", "same\n"],
    ["changed.d.ts", "native\n"],
    ["extra.d.ts", "extra\n"],
  ]);
  assert.deepEqual(compareDeclarationMaps(stable, native), {
    changed: ["changed.d.ts"],
    extra: ["extra.d.ts"],
    missing: ["missing.d.ts"],
    success: false,
  });
});
