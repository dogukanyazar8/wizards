import assert from "node:assert/strict";
import { it } from "node:test";
import { findSettingsTab } from "./tree";
import { buildSettingsHref, resolveSettingsRoute } from "./navigation";

it("exposes language and region controls under appearance", () => {
  const language = findSettingsTab("appearance", "language");
  assert.deepEqual(
    language?.groups.flatMap((group) => group.rows.map((row) => row.key)),
    ["l1", "l2", "l3", "l4"],
  );
  assert.equal(buildSettingsHref("appearance", "language"), "/settings/appearance/language");
  assert.deepEqual(resolveSettingsRoute("appearance", "language"), {
    section: "appearance",
    tab: "language",
  });
  assert.equal(
    findSettingsTab("account", "privacy")?.groups.some((group) =>
      group.rows.some((row) => row.key === "l1"),
    ),
    false,
  );
});
