import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mobileCopy } from "../src/locale/mobile-copy";
import type { MobileUserProfile } from "../src/social/mobile-social-client";
import {
  buildMobileProfilePageSections,
  findMobileProfileDirectConversationId,
  formatMobileProfileMonthYear,
  formatMobileProfileMutualFriendsSummary,
  formatMobileProfileMutualServerSubtitle,
  formatMobileProfileServerJoin,
  formatMobileProfileWhisprJoin,
  getMobileProfileMutualFriendsOverflow,
  getMobileProfilePageVariant,
  getMobileProfileRoleColor,
  getTurkishDativeSuffix,
  getTurkishYearLocativeSuffix,
} from "../src/social/profile-page/mobile-profile-page-model";

function createProfile(overrides: Partial<MobileUserProfile> = {}): MobileUserProfile {
  return {
    badges: ["earlyMember"],
    bannerColor: null,
    bannerOffsetX: null,
    bannerOffsetY: null,
    bannerUrl: null,
    bio: "Frontend geliştirici",
    blocked: false,
    blockedBy: false,
    mutualFriends: { count: 0, preview: [] },
    mutualServers: { count: 0, preview: [] },
    note: null,
    presence: { customStatus: null, customStatusEmoji: null, status: "ONLINE" },
    registeredAt: "2024-05-18T09:00:00.000Z",
    relationship: "friend",
    self: false,
    serverContext: null,
    user: { avatarUrl: null, displayName: "Ayşegül", id: "user-2", username: "aysegul_dev" },
    ...overrides,
  };
}

function createServer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    iconUrl: null,
    id,
    memberCount: 128,
    name: "UAT ENV",
    shortName: "UE",
    ...overrides,
  } as MobileUserProfile["mutualServers"]["preview"][number];
}

describe("mobile profile page model", () => {
  it("selects the page variant from the relationship, self flag and block state", () => {
    assert.equal(getMobileProfilePageVariant(createProfile()), "friend");
    assert.equal(getMobileProfilePageVariant(createProfile({ relationship: "none" })), "peer");
    assert.equal(getMobileProfilePageVariant(createProfile({ self: true })), "self");
    assert.equal(
      getMobileProfilePageVariant(createProfile({ blocked: true, relationship: "blocked" })),
      "blocked",
    );
    // A block in the other direction reduces the page the same way.
    assert.equal(getMobileProfilePageVariant(createProfile({ blockedBy: true })), "blocked");
  });

  it("hides empty sections and keeps ABOUT alive without a bio", () => {
    const sections = buildMobileProfilePageSections(createProfile({ bio: null }));

    assert.equal(sections.about.visible, true);
    assert.equal(sections.about.bio, null);
    assert.equal(sections.about.registeredAt, "2024-05-18T09:00:00.000Z");
    assert.equal(sections.mutualServers.visible, false);
    assert.equal(sections.mutualFriends.visible, false);
    assert.equal(sections.roles.visible, false);
    assert.equal(sections.note.visible, true);
  });

  it("shows role chips only with a server context and never on your own page", () => {
    const withServer = buildMobileProfilePageSections(
      createProfile({
        serverContext: {
          joinedAt: "2025-02-04T09:00:00.000Z",
          roles: [{ color: 0x4f46e5, id: "role-1", name: "Geliştirici" }],
          serverId: "server-1",
          serverName: "UAT ENV",
        },
      }),
    );
    assert.equal(withServer.roles.visible, true);
    assert.equal(withServer.roles.items[0]?.name, "Geliştirici");
    assert.equal(withServer.about.serverName, "UAT ENV");

    const own = buildMobileProfilePageSections(createProfile({ self: true }));
    assert.equal(own.note.visible, false);
  });

  it("strips every section but identity for a blocked profile", () => {
    const sections = buildMobileProfilePageSections(
      createProfile({
        blocked: true,
        bio: "gizli",
        mutualFriends: {
          count: 2,
          preview: [
            { avatarUrl: null, displayName: null, id: "user-3", username: "mkaya" },
            { avatarUrl: null, displayName: null, id: "user-4", username: "elifay" },
          ],
        },
        mutualServers: { count: 1, preview: [createServer("server-1")] },
        relationship: "blocked",
      }),
    );

    assert.equal(sections.variant, "blocked");
    assert.equal(sections.about.visible, false);
    assert.equal(sections.about.bio, null);
    assert.equal(sections.mutualFriends.visible, false);
    assert.equal(sections.mutualServers.visible, false);
    assert.equal(sections.note.visible, false);
  });

  it("reads the peer role onto the mutual server row the page was opened from", () => {
    const sections = buildMobileProfilePageSections(
      createProfile({
        mutualServers: {
          count: 2,
          preview: [
            createServer("server-1"),
            createServer("server-2", { memberCount: 64, name: "CodeX", shortName: "CX" }),
          ],
        },
        serverContext: {
          joinedAt: "2025-02-04T09:00:00.000Z",
          roles: [{ color: 0x4f46e5, id: "role-1", name: "Geliştirici" }],
          serverId: "server-1",
          serverName: "UAT ENV",
        },
      }),
    );

    assert.equal(sections.mutualServers.rows[0]?.peerRoleName, "Geliştirici");
    assert.equal(sections.mutualServers.rows[1]?.peerRoleName, null);
    assert.equal(
      formatMobileProfileMutualServerSubtitle(sections.mutualServers.rows[0]!, mobileCopy.tr),
      "128 üye · Geliştirici",
    );
    assert.equal(
      formatMobileProfileMutualServerSubtitle(sections.mutualServers.rows[1]!, mobileCopy.tr),
      "64 üye",
    );
    assert.equal(
      formatMobileProfileMutualServerSubtitle(sections.mutualServers.rows[1]!, mobileCopy.en),
      "64 members",
    );
  });

  it("formats the join dates the way the 1c handoff reads them", () => {
    assert.equal(formatMobileProfileMonthYear("2024-05-18T09:00:00.000Z", "tr"), "Mayıs 2024");
    assert.equal(formatMobileProfileMonthYear("2024-05-18T09:00:00.000Z", "en"), "May 2024");
    assert.equal(formatMobileProfileMonthYear("not-a-date", "tr"), "");

    assert.equal(
      formatMobileProfileWhisprJoin("2024-05-18T09:00:00.000Z", "tr", mobileCopy.tr),
      "Mayıs 2024'te Whispr'a katıldı",
    );
    assert.equal(
      formatMobileProfileWhisprJoin("2024-05-18T09:00:00.000Z", "en", mobileCopy.en),
      "Joined Whispr in May 2024",
    );
    assert.equal(
      formatMobileProfileServerJoin("2025-02-04T09:00:00.000Z", "UAT ENV", "tr", mobileCopy.tr),
      "Şubat 2025'te UAT ENV'e katıldı",
    );
    assert.equal(
      formatMobileProfileServerJoin("2025-02-04T09:00:00.000Z", "UAT ENV", "en", mobileCopy.en),
      "Joined UAT ENV in February 2025",
    );
  });

  it("picks the Turkish locative for a year and the dative for a server name", () => {
    assert.equal(getTurkishYearLocativeSuffix(2024), "'te");
    assert.equal(getTurkishYearLocativeSuffix(2025), "'te");
    assert.equal(getTurkishYearLocativeSuffix(2026), "'da");
    assert.equal(getTurkishYearLocativeSuffix(2021), "'de");
    assert.equal(getTurkishYearLocativeSuffix(2040), "'ta");
    assert.equal(getTurkishYearLocativeSuffix(2020), "'de");

    assert.equal(getTurkishDativeSuffix("UAT ENV"), "'e");
    assert.equal(getTurkishDativeSuffix("CodeX"), "'e");
    assert.equal(getTurkishDativeSuffix("Oyun Kanal"), "'a");
    // A trailing vowel takes the y buffer.
    assert.equal(getTurkishDativeSuffix("Ada"), "'ya");
    assert.equal(getTurkishDativeSuffix("Köşe"), "'ye");
    // The brand's own dative is written into the copy string, because "Whispr"
    // is pronounced with a back vowel its spelling does not carry.
    assert.match(mobileCopy.tr.profilePageJoinedWhispr, /Whispr'a katıldı$/);
  });

  it("summarises mutual friends with three names and a remainder", () => {
    const mutualFriends = {
      count: 5,
      preview: [
        { avatarUrl: null, displayName: null, id: "user-3", username: "ogi_uat" },
        { avatarUrl: null, displayName: null, id: "user-4", username: "mkaya" },
        { avatarUrl: null, displayName: null, id: "user-5", username: "elifay" },
        { avatarUrl: null, displayName: "Berk D", id: "user-6", username: "berkd" },
      ],
    } satisfies MobileUserProfile["mutualFriends"];

    assert.equal(
      formatMobileProfileMutualFriendsSummary(mutualFriends, mobileCopy.tr),
      "ogi_uat, mkaya, elifay ve 2 kişi daha",
    );
    assert.equal(
      formatMobileProfileMutualFriendsSummary(mutualFriends, mobileCopy.en),
      "ogi_uat, mkaya, elifay and 2 others",
    );
    assert.equal(getMobileProfileMutualFriendsOverflow(mutualFriends, 4), 1);
    assert.equal(
      formatMobileProfileMutualFriendsSummary({ count: 0, preview: [] }, mobileCopy.tr),
      "",
    );
    assert.equal(
      formatMobileProfileMutualFriendsSummary(
        { count: 2, preview: mutualFriends.preview.slice(0, 2) },
        mobileCopy.tr,
      ),
      "ogi_uat, mkaya",
    );
  });

  it("converts stored role colors and rejects the unset value", () => {
    assert.equal(getMobileProfileRoleColor(0x4f46e5), "#4f46e5");
    assert.equal(getMobileProfileRoleColor(0), null);
    assert.equal(getMobileProfileRoleColor(-1), null);
  });

  it("finds an existing 1:1 conversation and never invents one", () => {
    const conversations = [
      {
        id: "group-1",
        participants: [{ id: "user-2" }, { id: "user-9" }],
        type: "GROUP_DM" as const,
      },
      { id: "dm-1", participants: [{ id: "user-1" }, { id: "user-2" }], type: "DM" as const },
    ];

    assert.equal(findMobileProfileDirectConversationId(conversations, "user-2"), "dm-1");
    assert.equal(findMobileProfileDirectConversationId(conversations, "user-7"), null);
    assert.equal(findMobileProfileDirectConversationId([], "user-2"), null);
  });
});
