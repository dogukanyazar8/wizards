import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BADGE_IDS } from "@wizards/types";

const service = import("./mobile-user-profile-service");

describe("mobile profile badge derivation", () => {
  it("derives every badge from an account fact or a stored row", async () => {
    const { MOBILE_PROFILE_EARLY_MEMBER_BEFORE, deriveMobileProfileBadges } = await service;
    const threshold = Date.parse(MOBILE_PROFILE_EARLY_MEMBER_BEFORE);

    assert.deepEqual(
      deriveMobileProfileBadges({
        premiumType: "FULL",
        registeredAt: new Date(threshold - 1),
        storedBadgeIds: ["inviter"],
      }),
      ["earlyMember", "supporter", "inviter"],
    );
    assert.deepEqual(
      deriveMobileProfileBadges({
        premiumType: "NONE",
        registeredAt: new Date(threshold),
        storedBadgeIds: [],
      }),
      [],
    );
  });

  /**
   * The guard on 00 §2's compatibility constraint: this field feeds 0.8.x
   * clients that parse the profile with a `.strict()` schema and cannot be
   * updated over the air. A single new id leaking out of the engine would stop
   * their profile card from opening at all.
   */
  it("never lets a new catalog id reach the frozen profile field", async () => {
    const { MOBILE_PROFILE_EARLY_MEMBER_BEFORE, deriveMobileProfileBadges } = await service;
    const threshold = Date.parse(MOBILE_PROFILE_EARLY_MEMBER_BEFORE);

    assert.deepEqual(
      deriveMobileProfileBadges({
        premiumType: "FULL",
        registeredAt: new Date(threshold - 1),
        // Every badge the catalog knows, including the thirteen this payload
        // has no way to describe.
        storedBadgeIds: [...BADGE_IDS],
      }),
      ["earlyMember", "supporter", "inviter"],
    );
  });

  it("reads inviter off the badge row rather than an invite count", async () => {
    const { deriveMobileProfileBadges } = await service;
    const facts = {
      premiumType: "NONE",
      registeredAt: new Date("2025-01-01T00:00:00.000Z"),
    } as const;

    assert.deepEqual(deriveMobileProfileBadges({ ...facts, storedBadgeIds: ["inviter"] }), [
      "earlyMember",
      "inviter",
    ]);
    // No row means no badge: an invite that nobody redeemed proves nothing, and
    // the profile read no longer counts invites to find that out.
    assert.deepEqual(deriveMobileProfileBadges(facts), ["earlyMember"]);
  });

  it("keeps an admin-revoked derived badge out of the frozen legacy field", async () => {
    const { deriveMobileProfileBadges } = await service;

    assert.deepEqual(
      deriveMobileProfileBadges({
        premiumType: "FULL",
        registeredAt: new Date("2025-01-01T00:00:00.000Z"),
        storedBadgeIds: ["inviter"],
        suppressedBadgeIds: ["earlyMember", "supporter"],
      }),
      ["inviter"],
    );
  });

  it("stays deterministic: the same account facts always give the same badges", async () => {
    const { deriveMobileProfileBadges } = await service;
    const facts = {
      premiumType: "NONE",
      registeredAt: new Date("2025-01-01T00:00:00.000Z"),
      storedBadgeIds: ["inviter"],
    } as const;

    assert.deepEqual(deriveMobileProfileBadges(facts), deriveMobileProfileBadges(facts));
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

  /**
   * `User.status` is the presence the account chose and nothing clears it on
   * disconnect, so reading a peer's presence off the column reported every
   * account that had ever been online as still online. The live socket registry
   * is the answer for peers; the column stays the answer for your own card.
   */
  it("reads a peer's presence off the live registry, not off the stored column", async () => {
    const { resolveMobileProfilePresenceStatus } = await service;

    assert.equal(
      resolveMobileProfilePresenceStatus({
        livePresence: { status: "OFFLINE" },
        self: false,
        storedStatus: "ONLINE",
      }),
      "OFFLINE",
    );
    // No record at all is itself an offline answer: presence only exists while a
    // socket is registered.
    assert.equal(
      resolveMobileProfilePresenceStatus({ livePresence: null, self: false, storedStatus: "DND" }),
      "OFFLINE",
    );
    assert.equal(
      resolveMobileProfilePresenceStatus({
        livePresence: { status: "IDLE" },
        self: false,
        storedStatus: "ONLINE",
      }),
      "IDLE",
    );
  });

  it("keeps your own card on the presence you picked", async () => {
    const { resolveMobileProfilePresenceStatus } = await service;

    assert.equal(
      resolveMobileProfilePresenceStatus({
        livePresence: { status: "OFFLINE" },
        self: true,
        storedStatus: "DND",
      }),
      "DND",
    );
    // "Görünmez" is still cropped downstream; the resolver hands the stored value
    // over untouched and `readProfilePresence` publishes it as offline.
    assert.equal(
      resolveMobileProfilePresenceStatus({
        livePresence: null,
        self: true,
        storedStatus: "INVISIBLE",
      }),
      "INVISIBLE",
    );
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
