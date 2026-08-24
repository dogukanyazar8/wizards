import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProfileCompletionSummary } from "@/lib/account/profile-completion";

describe("profile completion", () => {
  it("scores visible profile fields without relying on dummy constants", () => {
    const summary = getProfileCompletionSummary({
      avatarUrl: "https://ufs.sh/f/avatar.webp",
      displayName: "CodeX",
      email: "codex@example.com",
      username: "codex",
    });

    assert.equal(summary.percent, 100);
    assert.equal(summary.completedWeight, summary.totalWeight);
    assert.equal(
      summary.items.every((item) => item.complete),
      true,
    );
  });

  it("uses email presence when verified-email state is not available yet", () => {
    const summary = getProfileCompletionSummary({
      displayName: "CodeX",
      email: "codex@example.com",
      username: "codex",
    });

    assert.equal(summary.percent, 80);
    assert.equal(summary.items.find((item) => item.id === "emailVerified")?.complete, true);
    assert.equal(summary.items.find((item) => item.id === "avatar")?.complete, false);
  });

  it("honors explicit email verification and future security signals when provided", () => {
    const summary = getProfileCompletionSummary({
      avatarUrl: "https://ufs.sh/f/avatar.webp",
      customStatus: "",
      displayName: "CodeX",
      email: "codex@example.com",
      emailVerified: false,
      twoFactorEnabled: true,
      username: "codex",
    });

    assert.equal(summary.items.find((item) => item.id === "emailVerified")?.complete, false);
    assert.equal(summary.items.find((item) => item.id === "twoFactor")?.complete, true);
    assert.equal(summary.items.find((item) => item.id === "customStatus")?.complete, false);
    assert.equal(summary.percent, 76);
  });
});
