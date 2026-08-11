import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGroupNameFromMembers } from "./group-name";

describe("buildGroupNameFromMembers", () => {
  it("joins three names with the Turkish last separator, exactly as 2c prints it", () => {
    assert.equal(
      buildGroupNameFromMembers(["Atakan", "UAT Test", "DY"], "tr"),
      "Atakan, UAT Test ve DY",
    );
  });

  it("translates the last separator rather than copying the Turkish one", () => {
    assert.equal(
      buildGroupNameFromMembers(["Atakan", "UAT Test", "DY"], "en"),
      "Atakan, UAT Test and DY",
    );
  });

  it("uses the separator alone for two names", () => {
    assert.equal(buildGroupNameFromMembers(["Selin", "Kaan"], "tr"), "Selin ve Kaan");
    assert.equal(buildGroupNameFromMembers(["Selin", "Kaan"], "en"), "Selin and Kaan");
  });

  it("returns the single name untouched", () => {
    assert.equal(buildGroupNameFromMembers(["Selin"], "tr"), "Selin");
  });

  it("returns an empty string for an empty list so the caller owns the fallback", () => {
    assert.equal(buildGroupNameFromMembers([], "tr"), "");
  });

  it("drops blank entries instead of rendering an empty slot", () => {
    assert.equal(buildGroupNameFromMembers(["Atakan", "   ", "DY"], "tr"), "Atakan ve DY");
    assert.equal(buildGroupNameFromMembers(["  ", ""], "tr"), "");
  });

  it("trims the names it keeps", () => {
    assert.equal(buildGroupNameFromMembers([" Atakan ", "DY "], "tr"), "Atakan ve DY");
  });

  it("does not truncate a long roster — clamping belongs to the renderer (§11.0.6)", () => {
    const names = Array.from({ length: 12 }, (_, index) => `Uye${index + 1}`);
    const result = buildGroupNameFromMembers(names, "tr");

    assert.ok(result.startsWith("Uye1, Uye2, "));
    assert.ok(result.endsWith("Uye11 ve Uye12"));
    assert.ok(!result.includes("…"));
  });
});
