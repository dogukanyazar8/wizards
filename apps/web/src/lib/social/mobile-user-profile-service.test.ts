import assert from "node:assert/strict";
import { describe, it } from "node:test";

const service = import("./mobile-user-profile-service");

describe("mobile profile badge derivation", () => {
  it("derives every badge from an account fact rather than stored state", async () => {
    const { MOBILE_PROFILE_EARLY_MEMBER_BEFORE, deriveMobileProfileBadges } = await service;
    const threshold = Date.parse(MOBILE_PROFILE_EARLY_MEMBER_BEFORE);

    assert.deepEqual(
      deriveMobileProfileBadges({
        premiumType: "TIER_1",
        registeredAt: new Date(threshold - 1),
        usedInviteCount: 4,
      }),
      ["earlyMember", "supporter", "inviter"],
    );
    assert.deepEqual(
      deriveMobileProfileBadges({
        premiumType: "NONE",
        registeredAt: new Date(threshold),
        usedInviteCount: 0,
      }),
      [],
    );
  });

  it("stays deterministic: the same account facts always give the same badges", async () => {
    const { deriveMobileProfileBadges } = await service;
    const facts = {
      premiumType: "NONE",
      registeredAt: new Date("2025-01-01T00:00:00.000Z"),
      usedInviteCount: 1,
    };

    assert.deepEqual(deriveMobileProfileBadges(facts), deriveMobileProfileBadges(facts));
    // An invite that was never used is not a badge: the row alone proves nothing.
    assert.deepEqual(deriveMobileProfileBadges({ ...facts, usedInviteCount: 0 }), ["earlyMember"]);
  });
});

describe("mobile profile relationship resolution", () => {
  it("reads the block direction off the row that carries it", async () => {
    const { resolveMobileProfileRelationship } = await service;

    assert.deepEqual(
      resolveMobileProfileRelationship("user-1", [
        { receiverId: "user-2", senderId: "user-1", status: "BLOCKED" },
      ]),
      { blocked: true, blockedBy: false, relationship: "blocked" },
    );
    assert.deepEqual(
      resolveMobileProfileRelationship("user-1", [
        { receiverId: "user-1", senderId: "user-2", status: "BLOCKED" },
      ]),
      { blocked: false, blockedBy: true, relationship: "blocked" },
    );
  });

  it("orients a pending request and lets a block outrank a friendship", async () => {
    const { resolveMobileProfileRelationship } = await service;

    assert.equal(
      resolveMobileProfileRelationship("user-1", [
        { receiverId: "user-2", senderId: "user-1", status: "PENDING" },
      ]).relationship,
      "outgoing",
    );
    assert.equal(
      resolveMobileProfileRelationship("user-1", [
        { receiverId: "user-1", senderId: "user-2", status: "PENDING" },
      ]).relationship,
      "incoming",
    );
    assert.equal(
      resolveMobileProfileRelationship("user-1", [
        { receiverId: "user-2", senderId: "user-1", status: "ACCEPTED" },
        { receiverId: "user-1", senderId: "user-2", status: "BLOCKED" },
      ]).relationship,
      "blocked",
    );
    assert.deepEqual(resolveMobileProfileRelationship("user-1", []), {
      blocked: false,
      blockedBy: false,
      relationship: "none",
    });
  });
});

describe("mobile profile presence read", () => {
  it("drops a custom status once its deadline has passed", async () => {
    const { readActiveCustomStatus } = await service;
    const now = new Date("2026-07-23T12:00:00.000Z");

    assert.equal(
      readActiveCustomStatus("Release day", new Date("2026-07-23T11:59:59.000Z"), now),
      null,
    );
    assert.equal(
      readActiveCustomStatus("Release day", new Date("2026-07-23T18:00:00.000Z"), now),
      "Release day",
    );
    assert.equal(readActiveCustomStatus("Release day", null, now), "Release day");
    assert.equal(readActiveCustomStatus(null, null, now), null);
  });

  it("publishes an invisible account as offline and leaks none of its status", async () => {
    const { readProfilePresence } = await service;
    const invisible = readProfilePresence({
      customStatus: "In a meeting",
      customStatusEmoji: "📵",
      customStatusExpiresAt: null,
      status: "INVISIBLE",
    });

    // The whole point of "Görünmez": the peer read must show nothing that would
    // tell a viewer the account is actually being used.
    assert.deepEqual(invisible, {
      customStatus: null,
      customStatusEmoji: null,
      status: "OFFLINE",
    });
    assert.deepEqual(
      readProfilePresence({
        customStatus: "In a meeting",
        customStatusEmoji: "📵",
        customStatusExpiresAt: null,
        status: "OFFLINE",
      }),
      invisible,
    );
  });

  it("keeps the emoji paired with the message it decorates", async () => {
    const { readProfilePresence } = await service;
    const now = new Date("2026-07-23T12:00:00.000Z");

    assert.deepEqual(
      readProfilePresence(
        {
          customStatus: "Shipping 11a",
          customStatusEmoji: "🚀",
          customStatusExpiresAt: new Date("2026-07-23T18:00:00.000Z"),
          status: "ONLINE",
        },
        now,
      ),
      { customStatus: "Shipping 11a", customStatusEmoji: "🚀", status: "ONLINE" },
    );
    // An expired message takes its emoji with it; a lone emoji would render as a
    // status line with no text behind it.
    assert.deepEqual(
      readProfilePresence(
        {
          customStatus: "Shipping 11a",
          customStatusEmoji: "🚀",
          customStatusExpiresAt: new Date("2026-07-23T06:00:00.000Z"),
          status: "DND",
        },
        now,
      ),
      { customStatus: null, customStatusEmoji: null, status: "DND" },
    );
  });
});
