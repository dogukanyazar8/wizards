import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMobileProfileMutualSummary,
  formatMobileProfileStatusLine,
  getMobileProfileCardActions,
  getMobileProfileCardVariant,
  hasMobileProfileMutuals,
  shouldShowMobileProfileRoles,
  toMobileProfileRoleColor,
  toMobileProfileStatusTone,
} from "../src/social/profile-card/profile-card-model";

const STATUS_LABELS = {
  dnd: "Rahatsız etmeyin",
  idle: "Boşta",
  offline: "Çevrimdışı",
  online: "Çevrimiçi",
} as const;

function relation(
  overrides: Partial<{
    blocked: boolean;
    blockedBy: boolean;
    relationship: "blocked" | "friend" | "incoming" | "none" | "outgoing";
    self: boolean;
  }> = {},
) {
  return {
    blocked: false,
    blockedBy: false,
    relationship: "none" as const,
    self: false,
    ...overrides,
  };
}

describe("mobile profile card variants", () => {
  it("maps every relationship to the README button set", () => {
    assert.equal(getMobileProfileCardVariant(relation({ self: true })), "self");
    assert.equal(getMobileProfileCardVariant(relation({ relationship: "friend" })), "friend");
    assert.equal(getMobileProfileCardVariant(relation()), "stranger");
    assert.equal(getMobileProfileCardVariant(relation({ blocked: true })), "blocked");
    assert.equal(getMobileProfileCardVariant(relation({ blockedBy: true })), "blocked");

    assert.deepEqual(getMobileProfileCardActions(relation({ relationship: "friend" })), {
      calls: true,
      callsDisabledNotice: false,
      primary: "message",
      primaryDisabled: false,
      secondaryMessage: false,
      viewProfile: true,
    });
    assert.deepEqual(getMobileProfileCardActions(relation({ self: true })), {
      calls: false,
      callsDisabledNotice: false,
      primary: "editProfile",
      primaryDisabled: false,
      secondaryMessage: false,
      viewProfile: true,
    });
    assert.deepEqual(getMobileProfileCardActions(relation()), {
      calls: false,
      callsDisabledNotice: true,
      primary: "addFriend",
      primaryDisabled: false,
      secondaryMessage: true,
      viewProfile: true,
    });
  });

  it("holds a sent request in its passive state and answers an incoming one", () => {
    const outgoing = getMobileProfileCardActions(relation({ relationship: "outgoing" }));
    assert.equal(outgoing.primary, "requestSent");
    assert.equal(outgoing.primaryDisabled, true);
    assert.equal(outgoing.secondaryMessage, true);

    const incoming = getMobileProfileCardActions(relation({ relationship: "incoming" }));
    assert.equal(incoming.primary, "respondToRequest");
    assert.equal(incoming.primaryDisabled, false);
  });

  it("reduces a blocked pair to the restricted card", () => {
    const blocked = getMobileProfileCardActions(relation({ blocked: true, relationship: "blocked" }));
    assert.deepEqual(blocked, {
      calls: false,
      callsDisabledNotice: false,
      primary: "unblock",
      primaryDisabled: false,
      secondaryMessage: false,
      viewProfile: false,
    });

    // Being blocked leaves nothing to act on — an unblock would be meaningless.
    assert.equal(getMobileProfileCardActions(relation({ blockedBy: true })).primary, null);
  });
});

describe("mobile profile card server context", () => {
  const serverContext = {
    joinedAt: "2026-01-04T10:00:00.000Z",
    roles: [{ color: 5_198_053, id: "role-1", name: "Geliştirici" }],
    serverId: "server-1",
    serverName: "UAT ENV",
  };

  it("shows roles only when the card was opened from that server", () => {
    assert.equal(
      shouldShowMobileProfileRoles({ blocked: false, blockedBy: false, serverContext }, "server-1"),
      true,
    );
    // DM context: no server id, so no role section at all.
    assert.equal(
      shouldShowMobileProfileRoles(
        { blocked: false, blockedBy: false, serverContext },
        undefined,
      ),
      false,
    );
    assert.equal(
      shouldShowMobileProfileRoles({ blocked: false, blockedBy: false, serverContext }, "other"),
      false,
    );
    assert.equal(
      shouldShowMobileProfileRoles(
        { blocked: true, blockedBy: false, serverContext },
        "server-1",
      ),
      false,
    );
    assert.equal(
      shouldShowMobileProfileRoles(
        { blocked: false, blockedBy: false, serverContext: { ...serverContext, roles: [] } },
        "server-1",
      ),
      false,
    );
  });

  it("reads the role colour from the server payload, not from the id", () => {
    assert.equal(toMobileProfileRoleColor(5_198_053), "#4f50e5");
    assert.equal(toMobileProfileRoleColor(0x22a366), "#22a366");
    // 0 means "no colour set"; the chip falls back to the neutral token.
    assert.equal(toMobileProfileRoleColor(0), null);
    assert.equal(toMobileProfileRoleColor(Number.NaN), null);
  });
});

describe("mobile profile card status line", () => {
  it("joins the presence label with the custom status on one line", () => {
    assert.equal(toMobileProfileStatusTone("DND"), "dnd");
    assert.equal(
      formatMobileProfileStatusLine({
        customStatus: "Yeni tepki sistemini test ediyor 🎧",
        labels: STATUS_LABELS,
        status: "ONLINE",
        template: "{status} — {message}",
      }),
      "Çevrimiçi — Yeni tepki sistemini test ediyor 🎧",
    );
  });

  it("says only 'Çevrimdışı' when the user is offline", () => {
    assert.equal(
      formatMobileProfileStatusLine({
        customStatus: "Tatilde",
        labels: STATUS_LABELS,
        status: "OFFLINE",
        template: "{status} — {message}",
      }),
      "Çevrimdışı",
    );
    assert.equal(
      formatMobileProfileStatusLine({
        customStatus: "   ",
        labels: STATUS_LABELS,
        status: "IDLE",
        template: "{status} — {message}",
      }),
      "Boşta",
    );
  });
});

describe("mobile profile card mutuals", () => {
  const summary = (serverCount: number, friendCount: number) =>
    formatMobileProfileMutualSummary({
      friendCount,
      friendsNone: "Ortak arkadaş yok",
      friendsTemplate: "{count} ortak arkadaş",
      serverCount,
      serversNone: "Ortak sunucu yok",
      serversTemplate: "{count} ortak sunucu",
      summaryTemplate: "{servers} · {friends}",
    });

  it("counts both sides and names the empty half", () => {
    assert.equal(summary(3, 5), "3 ortak sunucu · 5 ortak arkadaş");
    assert.equal(summary(1, 0), "1 ortak sunucu · Ortak arkadaş yok");
  });

  it("hides the row outright when nothing is shared", () => {
    assert.equal(
      hasMobileProfileMutuals({
        mutualFriends: { count: 0, preview: [] },
        mutualServers: { count: 0, preview: [] },
      }),
      false,
    );
    assert.equal(
      hasMobileProfileMutuals({
        mutualFriends: { count: 0, preview: [] },
        mutualServers: { count: 2, preview: [] },
      }),
      true,
    );
  });
});
