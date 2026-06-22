import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDesktopInviteUrl,
  normalizeInviteCodeForDesktop,
  shouldAutoAcceptDesktopInvite,
} from "./desktop-link";

describe("desktop invite links", () => {
  it("builds a whispr protocol URL for safe invite codes only", () => {
    assert.equal(
      buildDesktopInviteUrl("ABCDEFGH"),
      "whispr://invite/ABCDEFGH?desktop=1",
    );
    assert.equal(
      buildDesktopInviteUrl("invite_code-01"),
      "whispr://invite/invite_code-01?desktop=1",
    );
  });

  it("rejects unsafe invite codes before creating custom protocol URLs", () => {
    assert.equal(normalizeInviteCodeForDesktop(""), null);
    assert.equal(normalizeInviteCodeForDesktop("../ABCDEFGH"), null);
    assert.equal(normalizeInviteCodeForDesktop("ABC/DEFG"), null);
    assert.equal(normalizeInviteCodeForDesktop("ABC\\DEFG"), null);
    assert.equal(normalizeInviteCodeForDesktop("A".repeat(97)), null);
    assert.equal(buildDesktopInviteUrl("https://example.com/invite/ABCDEFGH"), null);
  });

  it("recognizes the explicit desktop auto-accept marker", () => {
    assert.equal(shouldAutoAcceptDesktopInvite("1"), true);
    assert.equal(shouldAutoAcceptDesktopInvite("true"), true);
    assert.equal(shouldAutoAcceptDesktopInvite(["1", "0"]), true);
    assert.equal(shouldAutoAcceptDesktopInvite("0"), false);
    assert.equal(shouldAutoAcceptDesktopInvite(undefined), false);
  });
});
