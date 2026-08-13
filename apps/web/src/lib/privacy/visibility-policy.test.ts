import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPresenceBroadcastAudience,
  evaluateVisibilityPolicy,
  profileVisibilityWhereForViewer,
  redactPresenceCollectionForViewer,
  redactPresenceForViewer,
  resolveVisibilityDecisions,
} from "./visibility-policy";

describe("visibility policy", () => {
  it("always lets the account owner read their own profile and presence", () => {
    assert.deepEqual(
      evaluateVisibilityPolicy({
        blocked: true,
        isFriend: false,
        presenceVisibility: "NOBODY",
        profileVisibility: "NOBODY",
        self: true,
      }),
      { canViewPresence: true, canViewProfile: true },
    );
  });

  it("lets accepted friends through FRIENDS without widening NOBODY", () => {
    assert.deepEqual(
      evaluateVisibilityPolicy({
        blocked: false,
        isFriend: true,
        presenceVisibility: "NOBODY",
        profileVisibility: "FRIENDS",
        self: false,
      }),
      { canViewPresence: false, canViewProfile: true },
    );
  });

  it("lets a block in either direction override every public preference", () => {
    assert.deepEqual(
      evaluateVisibilityPolicy({
        blocked: true,
        isFriend: true,
        presenceVisibility: "EVERYONE",
        profileVisibility: "EVERYONE",
        self: false,
      }),
      { canViewPresence: false, canViewProfile: false },
    );
  });

  it("batch-resolves missing settings as the additive migration defaults", async () => {
    const decisions = await resolveVisibilityDecisions("viewer", ["friend", "stranger"], {
      findRelationships: async () => [
        { receiverId: "friend", senderId: "viewer", status: "ACCEPTED" },
      ],
      findSubjects: async () => [
        {
          id: "friend",
          settings: { presenceVisibility: "FRIENDS", profileVisibility: "FRIENDS" },
        },
        { id: "stranger", settings: null },
      ],
    });

    assert.deepEqual(decisions.get("friend"), {
      canViewPresence: true,
      canViewProfile: true,
    });
    assert.deepEqual(decisions.get("stranger"), {
      canViewPresence: true,
      canViewProfile: true,
    });
  });

  it("builds one pre-pagination query gate for public, friend-only and blocked profiles", () => {
    const where = profileVisibilityWhereForViewer("viewer");
    const serialized = JSON.stringify(where);

    assert.match(serialized, /profileVisibility.*EVERYONE/);
    assert.match(serialized, /profileVisibility.*FRIENDS/);
    assert.match(serialized, /friendRequestsSent.*ACCEPTED/);
    assert.match(serialized, /friendRequestsReceived.*ACCEPTED/);
    assert.match(serialized, /friendRequestsSent.*BLOCKED/);
    assert.match(serialized, /friendRequestsReceived.*BLOCKED/);
    assert.doesNotMatch(serialized, /NOBODY/);
  });

  it("redacts every presence-derived field when denied or invisible", () => {
    const visible = {
      customStatus: "Shipping",
      lastSeenAt: "2026-08-13T12:00:00.000Z",
      status: "ONLINE" as const,
    };

    assert.deepEqual(
      redactPresenceForViewer({ canViewPresence: false, invisible: false, presence: visible }),
      { customStatus: null, lastSeenAt: null, status: "OFFLINE" },
    );
    assert.deepEqual(
      redactPresenceForViewer({ canViewPresence: true, invisible: true, presence: visible }),
      { customStatus: null, lastSeenAt: null, status: "OFFLINE" },
    );
    assert.deepEqual(
      redactPresenceForViewer({ canViewPresence: true, invisible: false, presence: visible }),
      visible,
    );
  });

  it("redacts a whole payload with pre-resolved batch decisions", () => {
    const result = redactPresenceCollectionForViewer({
      decisions: new Map([
        ["visible", { canViewPresence: true, canViewProfile: true }],
        ["private", { canViewPresence: false, canViewProfile: true }],
      ]),
      invisibleUserIds: new Set(["visible"]),
      lastSeenByUserId: new Map([
        ["visible", "2026-08-13T10:00:00.000Z"],
        ["private", "2026-08-13T11:00:00.000Z"],
      ]),
      presenceByUserId: new Map([
        ["visible", { customStatus: "Hidden mode", status: "OFFLINE" }],
        ["private", { customStatus: "Private", status: "ONLINE" }],
      ]),
      subjectIds: ["visible", "private"],
    });

    assert.deepEqual(result.presenceByUserId.get("visible"), {
      customStatus: null,
      status: "OFFLINE",
    });
    assert.deepEqual(result.presenceByUserId.get("private"), {
      customStatus: null,
      status: "OFFLINE",
    });
    assert.equal(result.lastSeenByUserId.get("visible"), null);
    assert.equal(result.lastSeenByUserId.get("private"), null);
  });

  it("builds bounded socket audiences without letting block or preference widen fan-out", () => {
    const common = {
      blockedUserIds: ["blocked"],
      friendUserIds: ["friend", "blocked"],
      serverIds: ["server-1"],
      userId: "self",
    };

    assert.deepEqual(buildPresenceBroadcastAudience({ ...common, presenceVisibility: "NOBODY" }), {
      blockedUserIds: ["blocked"],
      directUserIds: ["self"],
      serverIds: [],
    });
    assert.deepEqual(buildPresenceBroadcastAudience({ ...common, presenceVisibility: "FRIENDS" }), {
      blockedUserIds: ["blocked"],
      directUserIds: ["self", "friend"],
      serverIds: [],
    });
    assert.deepEqual(
      buildPresenceBroadcastAudience({ ...common, presenceVisibility: "EVERYONE" }),
      {
        blockedUserIds: ["blocked"],
        directUserIds: ["self", "friend"],
        serverIds: ["server-1"],
      },
    );
  });
});
