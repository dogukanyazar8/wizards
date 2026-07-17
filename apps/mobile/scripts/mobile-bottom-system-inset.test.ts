import assert from "node:assert/strict";
import test from "node:test";
import { resolveMobileBottomSystemSpacing } from "../src/app/mobile-bottom-system-inset";

test("bottom system spacing preserves the design minimum when Android reports no bottom inset", () => {
  assert.equal(resolveMobileBottomSystemSpacing(0, 18), 18);
});

test("bottom system spacing raises interactive content above a larger Android navigation bar", () => {
  assert.equal(resolveMobileBottomSystemSpacing(24, 18), 24);
  assert.equal(resolveMobileBottomSystemSpacing(48, 18), 48);
});

test("bottom system spacing fails closed for invalid runtime measurements", () => {
  assert.equal(resolveMobileBottomSystemSpacing(Number.NaN, 18), 18);
  assert.equal(resolveMobileBottomSystemSpacing(-48, 18), 18);
  assert.equal(resolveMobileBottomSystemSpacing(48, Number.NaN), 48);
});
