import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const VIEW = readFileSync(fileURLToPath(new URL("./friends-view.tsx", import.meta.url)), "utf8");
const MENU = readFileSync(fileURLToPath(new URL("./friend-row-menu.tsx", import.meta.url)), "utf8");

describe("arkadaş araç satırı", () => {
  it("dört sekmenin ortak yüzeyi olarak çizilir", () => {
    assert.ok(VIEW.includes("function FriendsToolbar"));
    assert.ok(VIEW.includes("<FriendsToolbar"));
    assert.ok(VIEW.includes('data-testid="friends-toolbar"'));
  });

  it("sıralama seçenekleri anlamlı ikon taşır", () => {
    for (const id of [
      "friends-sort-status-icon",
      "friends-sort-name-icon",
      "friends-sort-recent-icon",
    ]) {
      assert.ok(VIEW.includes(`testId: "${id}"`), id);
    }
  });
});

describe("arkadaş satırı menüsü", () => {
  it("referans seçeneklerinin her biri ikon taşır", () => {
    for (const id of [
      "friend-menu-profile-icon",
      "friend-menu-invite-icon",
      "friend-menu-mute-icon",
      "friend-menu-block-icon",
      "friend-menu-remove-icon",
    ]) {
      assert.ok(MENU.includes(`data-testid="${id}"`), id);
    }
  });
});
