import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getRelativeShortcutTarget } from "./navigation";

const targets = [
  { href: "/one", id: "one", unread: false },
  { href: "/two", id: "two", unread: true },
  { href: "/three", id: "three", unread: true },
] as const;

describe("shortcut navigation", () => {
  it("moves in either direction and wraps", () => {
    assert.equal(getRelativeShortcutTarget(targets, "one", 1)?.id, "two");
    assert.equal(getRelativeShortcutTarget(targets, "one", -1)?.id, "three");
    assert.equal(getRelativeShortcutTarget(targets, "three", 1)?.id, "one");
  });

  it("skips read targets without losing direction", () => {
    assert.equal(getRelativeShortcutTarget(targets, "one", 1, { unreadOnly: true })?.id, "two");
    assert.equal(getRelativeShortcutTarget(targets, "one", -1, { unreadOnly: true })?.id, "three");
  });

  it("returns null when no eligible target exists", () => {
    assert.equal(
      getRelativeShortcutTarget(
        [
          { href: "/one", id: "one", unread: false },
          { href: "/two", id: "two", unread: false },
        ],
        "one",
        1,
        { unreadOnly: true },
      ),
      null,
    );
    assert.equal(getRelativeShortcutTarget(targets, "two", 1, { unreadOnly: true })?.id, "three");
    assert.equal(
      getRelativeShortcutTarget(
        [
          { href: "/one", id: "one", unread: true },
          { href: "/two", id: "two", unread: false },
        ],
        "one",
        1,
        { unreadOnly: true },
      ),
      null,
    );
  });
});
