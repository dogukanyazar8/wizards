import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isLiveInvite, selectActiveLinkInvite } from "./invite-selection";

const NOW = Date.parse("2026-07-26T12:00:00.000Z");

function invite(overrides: Partial<Parameters<typeof selectActiveLinkInvite>[0][number]> = {}) {
  return {
    createdAt: new Date("2026-07-26T10:00:00.000Z"),
    expiresAt: null,
    maxUses: null,
    targetUserId: null,
    uses: 0,
    ...overrides,
  };
}

describe("invite liveness", () => {
  it("keeps an invite with no expiry and no cap alive", () => {
    assert.equal(isLiveInvite({ expiresAt: null, maxUses: null, uses: 99 }, NOW), true);
  });

  it("drops an invite once its expiry has passed", () => {
    assert.equal(
      isLiveInvite(
        { expiresAt: new Date("2026-07-26T11:59:59.999Z"), maxUses: null, uses: 0 },
        NOW,
      ),
      false,
    );
    assert.equal(
      isLiveInvite(
        { expiresAt: new Date("2026-07-26T12:00:00.001Z"), maxUses: null, uses: 0 },
        NOW,
      ),
      true,
    );
  });

  it("treats an expiry exactly at now as spent, never as one last usable moment", () => {
    assert.equal(isLiveInvite({ expiresAt: new Date(NOW), maxUses: null, uses: 0 }, NOW), false);
  });

  it("drops an invite once its seats are gone", () => {
    assert.equal(isLiveInvite({ expiresAt: null, maxUses: 5, uses: 4 }, NOW), true);
    assert.equal(isLiveInvite({ expiresAt: null, maxUses: 5, uses: 5 }, NOW), false);
    assert.equal(isLiveInvite({ expiresAt: null, maxUses: 1, uses: 2 }, NOW), false);
  });
});

describe("active link invite selection", () => {
  it("returns null when the server has no invites at all", () => {
    assert.equal(selectActiveLinkInvite([], NOW), null);
  });

  it("never promotes a targeted invite to the shared link", () => {
    assert.equal(selectActiveLinkInvite([invite({ targetUserId: "user-2" })], NOW), null);
  });

  it("skips expired and exhausted invites", () => {
    assert.equal(
      selectActiveLinkInvite(
        [
          invite({ expiresAt: new Date("2026-07-26T11:00:00.000Z") }),
          invite({ maxUses: 3, uses: 3 }),
        ],
        NOW,
      ),
      null,
    );
  });

  it("prefers the newest live untargeted invite", () => {
    const older = invite({ createdAt: new Date("2026-07-26T08:00:00.000Z") });
    const newer = invite({ createdAt: new Date("2026-07-26T11:00:00.000Z") });
    const targetedButNewest = invite({
      createdAt: new Date("2026-07-26T11:30:00.000Z"),
      targetUserId: "user-2",
    });

    assert.equal(selectActiveLinkInvite([older, newer, targetedButNewest], NOW), newer);
    assert.equal(selectActiveLinkInvite([newer, older], NOW), newer);
  });

  it("keeps a live invite that still has seats left", () => {
    const usable = invite({ maxUses: 10, uses: 9 });
    assert.equal(selectActiveLinkInvite([usable], NOW), usable);
  });
});
