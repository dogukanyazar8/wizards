import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_THEME_IDS } from "./admin-theme-picker";
import { findAdminNavMatches } from "./admin-nav-search";

describe("admin shell tools", () => {
  it("keeps the handoff's six supported themes", () => {
    assert.deepEqual(ADMIN_THEME_IDS, [
      "theme-light",
      "theme-lavender",
      "theme-dark",
      "theme-ash",
      "theme-onyx",
      "theme-ocean-dark",
    ]);
  });

  it("matches only local visible modules for the command navigation box", () => {
    const modules = [
      { href: "/admin", key: "overview", label: "Genel Bakış" },
      { href: "/admin/audit", key: "audit", label: "Denetim Kaydı" },
      { href: "/admin/users", key: "users", label: "Kullanıcılar" },
    ];

    assert.deepEqual(
      findAdminNavMatches("denetim", modules).map((module) => module.key),
      ["audit"],
    );
    assert.deepEqual(
      findAdminNavMatches("", modules).map((module) => module.key),
      ["overview", "audit", "users"],
    );
  });
});
