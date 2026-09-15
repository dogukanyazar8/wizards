import assert from "node:assert/strict";
import { it } from "node:test";
import { applyMessageAppearance } from "./appearance";

it("applies size and compact layout, then restores comfortable metrics", () => {
  const values = new Map<string, string>();
  const root = { style: { setProperty: (key: string, value: string) => values.set(key, value) } };
  applyMessageAppearance(root, { messageSizePx: 22, messageDisplayCompact: true });
  assert.equal(values.get("--message-body-size"), "1.375rem");
  assert.equal(values.get("--message-body-line-height"), "1.35");
  assert.equal(values.get("--message-compact-padding"), "0.25rem");
  applyMessageAppearance(root, { messageSizePx: 12, messageDisplayCompact: false });
  assert.equal(values.get("--message-body-size"), "0.75rem");
  assert.equal(values.get("--message-compact-padding"), "initial");
});
