import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GroupCallStateDTO, GroupPermissions } from "@wizards/types";

import {
  buildGroupInviteDisplayUrl,
  buildGroupNameHint,
  buildLiveGroupReadReceipt,
  buildMobileConversationFilterKey,
  parseMobileConversationFilters,
  serializeMobileConversationFilters,
  setMobileConversationFilter,
  formatDisappearingLabel,
  formatGroupTypingLabel,
  formatHistoryLabel,
  formatReadReceiptLabel,
  getConversationFilterCounts,
  getConversationFilterPredicate,
  getFrequentContacts,
  getGroupAvatarPair,
  getGroupCallBannerState,
  getGroupCapabilities,
  getGroupDescriptionCounter,
  getGroupNameCounter,
  getGroupLeaveIntent,
  getGroupMediaTiles,
  getGroupMemberRows,
  getGroupMentionCandidates,
  getGroupPermissionRows,
  getGroupQuickActions,
  getGroupReadStack,
  getGroupSenderColors,
  formatGroupHeaderMeta,
  getMemberSheetActions,
  getPinnedStripState,
  resolveGroupReadReceiptMessageId,
  resolveSenderNameColor,
  sortConversationsForInbox,
  splitPinnedConversations,
  type MobileConversationFilterRow,
  type MobileFrequentContactSource,
  type MobileGroupMemberSource,
} from "../src/app/mobile-group-chat-model";
import { mobileCopy } from "../src/locale/mobile-copy";

const permissions: GroupPermissions = {
  addMembers: "ALL",
  editInfo: "ADMINS",
  pinMessage: "ADMINS",
  sendMessage: "ALL",
};

function tile(userId: string, initials: string) {
  return { accent: "#C2185B", avatarUrl: null, initials, userId };
}

function row(overrides: Partial<MobileConversationFilterRow> = {}): MobileConversationFilterRow {
  return {
    id: "dm-1",
    lastMessageAt: "2026-08-11T10:00:00.000Z",
    mentionCount: 0,
    muted: false,
    pinnedAt: null,
    type: "DM",
    unreadCount: 0,
    ...overrides,
  };
}

describe("getGroupAvatarPair", () => {
  it("turns the second tile into +N once anyone is hidden (§11.0.7)", () => {
    const pair = getGroupAvatarPair([tile("u2", "AY"), tile("u3", "DY")], 3);

    assert.equal(pair.tiles.length, 1);
    assert.equal(pair.tiles[0]?.initials, "AY");
    assert.equal(pair.overflowLabel, "+4");
  });

  it("draws both initials when nobody is hidden", () => {
    const pair = getGroupAvatarPair([tile("u2", "AY"), tile("u3", "DY")], 0);

    assert.deepEqual(
      pair.tiles.map((entry) => entry.initials),
      ["AY", "DY"],
    );
    assert.equal(pair.overflowLabel, null);
  });

  it("keeps a single tile alone rather than pairing it with a +0", () => {
    const pair = getGroupAvatarPair([tile("u2", "AY")], 0);

    assert.equal(pair.tiles.length, 1);
    assert.equal(pair.overflowLabel, null);
  });

  it("still reports the hidden members when only one tile arrived", () => {
    const pair = getGroupAvatarPair([tile("u2", "AY")], 2);

    assert.equal(pair.tiles.length, 1);
    assert.equal(pair.overflowLabel, "+2");
  });

  it("draws nothing for an empty pair", () => {
    const pair = getGroupAvatarPair([], 0);

    assert.deepEqual(pair.tiles, []);
    assert.equal(pair.overflowLabel, null);
  });

  it("never draws more than the two tiles the 46px slot holds", () => {
    const pair = getGroupAvatarPair([tile("u2", "AY"), tile("u3", "DY"), tile("u4", "SL")], 0);

    assert.equal(pair.tiles.length, 2);
  });
});

describe("buildGroupNameHint", () => {
  it("prints the design's own example", () => {
    assert.equal(buildGroupNameHint(["Atakan", "UAT Test", "DY"], "tr"), "Atakan, UAT Test ve DY");
  });

  it("agrees with the server's derivation for the same input", () => {
    // §4.4: the hint and the header must be the same string, so both sides call
    // the shared rule rather than joining names themselves.
    assert.equal(buildGroupNameHint(["Selin", "Kaan"], "en"), "Selin and Kaan");
  });

  it("returns an empty string when nobody is selected", () => {
    assert.equal(buildGroupNameHint([], "tr"), "");
  });
});

describe("formatGroupTypingLabel", () => {
  const copy = mobileCopy.tr;

  it("names one typist", () => {
    assert.equal(formatGroupTypingLabel(["Ayşegül"], copy), "Ayşegül yazıyor…");
  });

  it("joins two", () => {
    assert.equal(
      formatGroupTypingLabel(["Ayşegül", "UAT Test"], copy),
      "Ayşegül ve UAT Test yazıyor…",
    );
  });

  it("counts the rest past two", () => {
    assert.equal(
      formatGroupTypingLabel(["Ayşegül", "UAT Test", "DY", "Selin"], copy),
      "Ayşegül +3 yazıyor…",
    );
  });

  it("draws no line when nobody is typing", () => {
    assert.equal(formatGroupTypingLabel([], copy), null);
  });
});

describe("formatReadReceiptLabel", () => {
  const copy = mobileCopy.tr;

  it("says nothing when nobody has read it — the row is not drawn", () => {
    assert.equal(formatReadReceiptLabel(0, false, copy), null);
  });

  it("counts the readers", () => {
    assert.equal(formatReadReceiptLabel(4, false, copy), "4 kişi okudu");
  });

  it("collapses to 'everyone' once they all have", () => {
    assert.equal(formatReadReceiptLabel(4, true, copy), "Herkes okudu");
  });

  it("ignores an everyone flag that arrives with a zero count", () => {
    assert.equal(formatReadReceiptLabel(0, true, copy), null);
  });
});

describe("conversation filter persistence", () => {
  it("keys the choice by account so a second account starts on Tümü", () => {
    assert.notEqual(
      buildMobileConversationFilterKey("user-1"),
      buildMobileConversationFilterKey("user-2"),
    );
  });

  it("round-trips a stored choice", () => {
    const stored = serializeMobileConversationFilters(
      setMobileConversationFilter({}, "user:1", "groups"),
    );

    assert.deepEqual(parseMobileConversationFilters(stored), { "user:1": "groups" });
  });

  it("drops the entry when the reader goes back to Tümü", () => {
    assert.deepEqual(setMobileConversationFilter({ "user:1": "muted" }, "user:1", "all"), {});
  });

  it("ignores a value that is no longer a filter id", () => {
    assert.deepEqual(parseMobileConversationFilters('{"user:1":"archived"}'), {});
  });

  it("survives a corrupt store rather than throwing on the first frame", () => {
    assert.deepEqual(parseMobileConversationFilters("not json"), {});
    assert.deepEqual(parseMobileConversationFilters(null), {});
    assert.deepEqual(parseMobileConversationFilters("[1,2]"), {});
  });
});

describe("getConversationFilterPredicate", () => {
  it("keeps everything under 'all'", () => {
    const keep = getConversationFilterPredicate("all");
    assert.equal(keep(row({ muted: true })), true);
  });

  it("counts a mention as unread even when the counter is zero", () => {
    const keep = getConversationFilterPredicate("unread");
    assert.equal(keep(row({ mentionCount: 2, unreadCount: 0 })), true);
    assert.equal(keep(row()), false);
  });

  it("keeps only groups under 'groups'", () => {
    const keep = getConversationFilterPredicate("groups");
    assert.equal(keep(row({ type: "GROUP_DM" })), true);
    assert.equal(keep(row()), false);
  });

  it("keeps only silenced rows under 'muted'", () => {
    const keep = getConversationFilterPredicate("muted");
    assert.equal(keep(row({ muted: true })), true);
    assert.equal(keep(row({ notifyLevel: "NONE" })), true);
    assert.equal(keep(row()), false);
  });
});

describe("getConversationFilterCounts", () => {
  it("counts each chip with the predicate that chip filters by", () => {
    const counts = getConversationFilterCounts([
      row({ id: "a", unreadCount: 3 }),
      row({ id: "b", mentionCount: 1, unreadCount: 0 }),
      row({ id: "c", type: "GROUP_DM" }),
      row({ id: "d", muted: true, type: "GROUP_DM" }),
      row({ id: "e" }),
    ]);

    // "b" holds an unseen mention with a zero counter, and the chip has to
    // agree with the list the chip opens.
    assert.deepEqual(counts, { groups: 2, muted: 1, unread: 2 });
  });

  it("counts nothing on an empty inbox rather than throwing", () => {
    assert.deepEqual(getConversationFilterCounts([]), { groups: 0, muted: 0, unread: 0 });
  });
});

describe("splitPinnedConversations", () => {
  it("lifts the pinned rows out in pin order and leaves the rest by activity", () => {
    const rows = [
      row({ id: "a", lastMessageAt: "2026-08-11T10:00:00.000Z" }),
      row({
        id: "b",
        lastMessageAt: "2026-08-11T09:00:00.000Z",
        pinnedAt: "2026-08-10T08:00:00.000Z",
      }),
      row({
        id: "c",
        lastMessageAt: "2026-08-11T11:00:00.000Z",
        pinnedAt: "2026-08-11T08:00:00.000Z",
      }),
    ];

    const split = splitPinnedConversations(rows);

    assert.deepEqual(
      split.pinned.map((entry) => entry.id),
      ["c", "b"],
    );
    assert.deepEqual(
      split.rest.map((entry) => entry.id),
      ["a"],
    );
  });

  it("draws no pinned section when nothing is pinned", () => {
    const split = splitPinnedConversations([row({ id: "a" })]);

    assert.deepEqual(split.pinned, []);
    assert.equal(split.rest.length, 1);
  });
});

describe("sortConversationsForInbox", () => {
  it("puts pinned rows first, newest pin first, then the rest by activity", () => {
    const rows = [
      row({ id: "plain-old", lastMessageAt: "2026-08-01T10:00:00.000Z" }),
      row({
        id: "pinned-old",
        lastMessageAt: "2026-08-09T10:00:00.000Z",
        pinnedAt: "2026-08-02T10:00:00.000Z",
      }),
      row({ id: "plain-new", lastMessageAt: "2026-08-10T10:00:00.000Z" }),
      row({
        id: "pinned-new",
        lastMessageAt: "2026-07-01T10:00:00.000Z",
        pinnedAt: "2026-08-05T10:00:00.000Z",
      }),
    ];

    assert.deepEqual(
      sortConversationsForInbox(rows).map((entry) => entry.id),
      ["pinned-new", "pinned-old", "plain-new", "plain-old"],
    );
  });

  it("does not mutate the caller's array", () => {
    const rows = [row({ id: "a" }), row({ id: "b", pinnedAt: "2026-08-05T10:00:00.000Z" })];
    sortConversationsForInbox(rows);

    assert.deepEqual(
      rows.map((entry) => entry.id),
      ["a", "b"],
    );
  });
});

describe("getGroupCapabilities", () => {
  it("gives an owner every switch", () => {
    assert.deepEqual(getGroupCapabilities("OWNER", permissions), {
      canAddMembers: true,
      canEditInfo: true,
      canManageRoles: true,
      canPin: true,
      canSend: true,
      canTransferOwnership: true,
    });
  });

  it("keeps role management and transfer away from an admin", () => {
    const capabilities = getGroupCapabilities("ADMIN", permissions);

    assert.equal(capabilities.canEditInfo, true);
    assert.equal(capabilities.canManageRoles, false);
    assert.equal(capabilities.canTransferOwnership, false);
  });

  it("applies the per-action level to a plain member", () => {
    const capabilities = getGroupCapabilities("MEMBER", permissions);

    assert.equal(capabilities.canSend, true);
    assert.equal(capabilities.canAddMembers, true);
    assert.equal(capabilities.canEditInfo, false);
    assert.equal(capabilities.canPin, false);
  });

  it("treats a conversation with no permissions payload as a 1:1 — everything allowed", () => {
    assert.equal(getGroupCapabilities(undefined, undefined).canSend, true);
  });
});

describe("getMemberSheetActions", () => {
  it("offers an owner promote and remove on a plain member", () => {
    assert.deepEqual(getMemberSheetActions("OWNER", "MEMBER", false), [
      "message",
      "profile",
      "promote",
      "remove",
    ]);
  });

  it("offers demote instead of promote on an admin", () => {
    assert.deepEqual(getMemberSheetActions("OWNER", "ADMIN", false), [
      "message",
      "profile",
      "demote",
      "remove",
    ]);
  });

  it("hides the moderation half from a member rather than disabling it (C5)", () => {
    assert.deepEqual(getMemberSheetActions("MEMBER", "MEMBER", false), ["message", "profile"]);
  });

  it("lets an admin remove a member but not another admin", () => {
    assert.deepEqual(getMemberSheetActions("ADMIN", "MEMBER", false), [
      "message",
      "profile",
      "remove",
    ]);
    assert.deepEqual(getMemberSheetActions("ADMIN", "ADMIN", false), ["message", "profile"]);
  });

  it("never offers the owner as a target", () => {
    assert.deepEqual(getMemberSheetActions("OWNER", "OWNER", false), ["message", "profile"]);
  });

  it("drops the message and profile rows on your own line", () => {
    assert.deepEqual(getMemberSheetActions("OWNER", "OWNER", true), []);
  });
});

describe("resolveSenderNameColor", () => {
  it("reads the colour the membership was given", () => {
    assert.equal(resolveSenderNameColor({ nameColor: "#1B8A55", userId: "u2" }), "#1B8A55");
  });

  it("falls back to a stable palette slot for a row written before the column existed", () => {
    const first = resolveSenderNameColor({ userId: "user-legacy" });
    const second = resolveSenderNameColor({ userId: "user-legacy" });

    assert.equal(first, second);
    assert.match(first, /^#[0-9A-F]{6}$/i);
  });

  it("ignores an empty colour rather than rendering a blank name", () => {
    assert.notEqual(resolveSenderNameColor({ nameColor: "  ", userId: "u2" }), "  ");
  });
});

describe("getPinnedStripState", () => {
  const pinnedMessage = {
    authorName: "Doğukan",
    dismissed: false,
    excerpt: "Demo yarın",
    id: "m1",
  };

  it("shows the strip with its preview line", () => {
    assert.deepEqual(getPinnedStripState({ pinnedMessage }, null), {
      messageId: "m1",
      preview: "Doğukan: Demo yarın",
      visible: true,
    });
  });

  it("hides it once this viewer dismissed that exact message", () => {
    assert.equal(getPinnedStripState({ pinnedMessage }, "m1").visible, false);
  });

  it("comes back for a different pin than the one that was dismissed", () => {
    assert.equal(getPinnedStripState({ pinnedMessage }, "m0").visible, true);
  });

  it("respects the server's own dismissed flag", () => {
    assert.equal(
      getPinnedStripState({ pinnedMessage: { ...pinnedMessage, dismissed: true } }, null).visible,
      false,
    );
  });

  it("has nothing to show when the group has no pin", () => {
    assert.deepEqual(getPinnedStripState({ pinnedMessage: null }, null), {
      messageId: null,
      preview: "",
      visible: false,
    });
  });
});

describe("getGroupCallBannerState", () => {
  function callState(overrides: Partial<GroupCallStateDTO> = {}): GroupCallStateDTO {
    return {
      active: true,
      conversationId: "dm-1",
      participants: [
        { joinedAt: "2026-08-11T10:00:00.000Z", userId: "u2" },
        { joinedAt: "2026-08-11T10:00:05.000Z", userId: "u3" },
      ],
      startedAt: "2026-08-11T10:00:00.000Z",
      video: false,
      ...overrides,
    };
  }

  it("is idle without a call", () => {
    assert.deepEqual(getGroupCallBannerState(null, "u1"), {
      count: 0,
      status: "idle",
      video: false,
    });
  });

  it("is idle once the last participant left", () => {
    assert.equal(getGroupCallBannerState(callState({ active: false }), "u1").status, "idle");
  });

  it("reports an ongoing call the viewer is outside of", () => {
    assert.deepEqual(getGroupCallBannerState(callState(), "u1"), {
      count: 2,
      status: "ongoing",
      video: false,
    });
  });

  it("reports the viewer's own call as joined", () => {
    assert.equal(getGroupCallBannerState(callState(), "u2").status, "joined");
  });

  it("carries the video flag so 2e's entry point knows which call it is", () => {
    assert.equal(getGroupCallBannerState(callState({ video: true }), "u1").video, true);
  });
});

describe("formatDisappearingLabel / formatHistoryLabel", () => {
  const copy = mobileCopy.tr;

  it("names each window", () => {
    assert.equal(formatDisappearingLabel("OFF", copy), "Kapalı");
    assert.equal(formatDisappearingLabel("H24", copy), "24 saat");
    assert.equal(formatDisappearingLabel("D7", copy), "7 gün");
    assert.equal(formatDisappearingLabel("D90", copy), "90 gün");
  });

  it("names each history window", () => {
    assert.equal(formatHistoryLabel("NONE", copy), "Hiç");
    assert.equal(formatHistoryLabel("LAST_24H", copy), "Son 24 saat");
    assert.equal(formatHistoryLabel("LAST_30D", copy), "Son 30 gün");
    assert.equal(formatHistoryLabel("ALL", copy), "Tümü");
  });
});

describe("buildGroupInviteDisplayUrl", () => {
  it("joins the deployment host with the code", () => {
    assert.equal(
      buildGroupInviteDisplayUrl("whispr.gg", "ABCDEFGHJKLM"),
      "whispr.gg/g/ABCDEFGHJKLM",
    );
  });

  it("hides the row when the deployment has no host", () => {
    assert.equal(buildGroupInviteDisplayUrl(null, "ABCDEFGHJKLM"), null);
  });
});

describe("getGroupNameCounter / getGroupDescriptionCounter", () => {
  it("counts up to the 32 the design prints", () => {
    assert.deepEqual(getGroupNameCounter("Whispr Mobil Ekibi"), {
      label: "18/32",
      over: false,
    });
  });

  it("flags an over-long name instead of clamping the number", () => {
    const counter = getGroupNameCounter("x".repeat(33));

    assert.equal(counter.label, "33/32");
    assert.equal(counter.over, true);
  });

  it("counts the trimmed value, the same length the write schema checks", () => {
    assert.equal(getGroupNameCounter("  ab  ").label, "2/32");
  });

  it("starts the description at 0/120", () => {
    assert.deepEqual(getGroupDescriptionCounter(""), { label: "0/120", over: false });
  });

  it("flags an over-long description", () => {
    assert.equal(getGroupDescriptionCounter("x".repeat(121)).over, true);
  });
});

describe("getFrequentContacts", () => {
  const now = new Date("2026-08-11T12:00:00.000Z");

  function source(
    id: string,
    daysAgo: number,
    overrides: Partial<MobileFrequentContactSource> = {},
  ): MobileFrequentContactSource {
    return {
      counterpartId: `user-${id}`,
      id,
      lastMessageAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
      type: "DM",
      ...overrides,
    };
  }

  it("returns the five newest 1:1 counterparts from the last 30 days", () => {
    const contacts = getFrequentContacts(
      [
        source("a", 1),
        source("b", 2),
        source("c", 3),
        source("d", 4),
        source("e", 5),
        source("f", 6),
      ],
      now,
    );

    assert.deepEqual(contacts, ["user-a", "user-b", "user-c", "user-d", "user-e"]);
  });

  it("drops conversations older than 30 days", () => {
    assert.deepEqual(
      getFrequentContacts([source("a", 1), source("b", 2), source("c", 3), source("d", 40)], now),
      ["user-a", "user-b", "user-c"],
    );
  });

  it("ignores groups — the section is about people", () => {
    const contacts = getFrequentContacts(
      [source("a", 1), source("b", 2), source("c", 3), source("g", 0, { type: "GROUP_DM" })],
      now,
    );

    assert.deepEqual(contacts, ["user-a", "user-b", "user-c"]);
  });

  it("spends a slot on a person once, not on every conversation with them", () => {
    const contacts = getFrequentContacts(
      [
        source("a", 1),
        source("a2", 2, { counterpartId: "user-a" }),
        source("b", 3),
        source("c", 4),
      ],
      now,
    );

    assert.deepEqual(contacts, ["user-a", "user-b", "user-c"]);
  });

  it("returns nothing when the section would draw fewer than three rows (V9)", () => {
    assert.deepEqual(getFrequentContacts([source("a", 1)], now), []);
  });

  it("skips a conversation whose counterpart is unknown", () => {
    const contacts = getFrequentContacts(
      [source("a", 1), source("b", 2), source("c", 3, { counterpartId: null })],
      now,
    );

    assert.deepEqual(contacts, []);
  });
});

/* ------------------------------------------------------------------ Faz 5 */

function member(
  userId: string,
  overrides: Partial<MobileGroupMemberSource> = {},
): MobileGroupMemberSource {
  return {
    avatarUrl: null,
    displayName: userId.toUpperCase(),
    joinedAt: "2026-03-12T09:00:00.000Z",
    lastSeenAt: null,
    nameColor: null,
    role: "MEMBER",
    status: "OFFLINE",
    userId,
    username: userId,
    ...overrides,
  };
}

describe("getGroupSenderColors", () => {
  it("reads the stored colour and falls back per user id", () => {
    const colors = getGroupSenderColors([
      member("a", { nameColor: "#C2185B" }),
      member("b", { nameColor: null }),
    ]);

    assert.equal(colors["a"], "#C2185B");
    assert.equal(colors["b"], resolveSenderNameColor({ userId: "b" }));
  });

  it("gives two members two entries rather than one shared value", () => {
    const colors = getGroupSenderColors([
      member("a", { nameColor: "#C2185B" }),
      member("b", { nameColor: "#1B8A55" }),
    ]);

    assert.notEqual(colors["a"], colors["b"]);
  });

  it("returns an empty map for an empty roster", () => {
    assert.deepEqual(getGroupSenderColors([]), {});
  });
});

describe("getGroupMentionCandidates", () => {
  it("offers the other members and never the viewer", () => {
    assert.deepEqual(
      getGroupMentionCandidates([member("a"), member("b")], "a").map(
        (candidate) => candidate.username,
      ),
      ["b"],
    );
  });

  it("never offers @everyone (§B4: undefined in a group DM)", () => {
    assert.equal(
      getGroupMentionCandidates([member("a"), member("b")], "a").some(
        (candidate) => candidate.username === "everyone",
      ),
      false,
    );
  });

  it("drops a member with no username to suggest", () => {
    assert.deepEqual(getGroupMentionCandidates([member("b", { username: "  " })], "a"), []);
  });
});

describe("formatGroupHeaderMeta", () => {
  it("splits the template into the member half and the online half", () => {
    assert.deepEqual(formatGroupHeaderMeta(6, 3, mobileCopy.tr), {
      members: "6 üye",
      online: "3 çevrimiçi",
    });
  });

  it("drops the online half when nobody is online", () => {
    assert.deepEqual(formatGroupHeaderMeta(6, 0, mobileCopy.tr), {
      members: "6 üye",
      online: null,
    });
  });

  it("never prints a negative count", () => {
    assert.deepEqual(formatGroupHeaderMeta(-4, -1, mobileCopy.tr), {
      members: "0 üye",
      online: null,
    });
  });
});

describe("getGroupMemberRows", () => {
  const roster = [
    member("c", { joinedAt: "2026-03-14T09:00:00.000Z" }),
    member("owner", { joinedAt: "2026-03-12T09:00:00.000Z", role: "OWNER" }),
    member("b", { joinedAt: "2026-03-13T09:00:00.000Z" }),
    member("admin", { joinedAt: "2026-03-15T09:00:00.000Z", role: "ADMIN" }),
  ];

  it("orders owner, admins, then members by join time", () => {
    assert.deepEqual(
      getGroupMemberRows(roster, "b").map((row) => row.member.userId),
      ["owner", "admin", "b", "c"],
    );
  });

  it("marks the viewer's own row", () => {
    assert.deepEqual(
      getGroupMemberRows(roster, "b")
        .filter((row) => row.isSelf)
        .map((row) => row.member.userId),
      ["b"],
    );
  });

  it("gives the owner the 'Grubu oluşturdu' subtitle", () => {
    assert.equal(getGroupMemberRows(roster, "b")[0]?.subtitle, "creator");
  });

  it("shows a last-seen subtitle only for an offline member that has one", () => {
    assert.deepEqual(
      getGroupMemberRows(
        [
          member("x", { lastSeenAt: "2026-03-14T07:00:00.000Z" }),
          member("y", { lastSeenAt: "2026-03-14T07:00:00.000Z", status: "ONLINE" }),
          member("z"),
        ],
        "viewer",
      ).map((row) => row.subtitle),
      ["lastSeen", "username", "username"],
    );
  });

  it("breaks a join-time tie by user id so the order never flickers", () => {
    assert.deepEqual(
      getGroupMemberRows([member("z"), member("a")], "viewer").map((row) => row.member.userId),
      ["a", "z"],
    );
  });

  it("treats a participant with no role as a member", () => {
    assert.equal(getGroupMemberRows([member("x", { role: undefined })], "v")[0]?.role, "MEMBER");
  });
});

describe("getGroupQuickActions", () => {
  it("draws four boxes when the viewer may add members", () => {
    assert.deepEqual(getGroupQuickActions({ canAddMembers: true }), [
      "mute",
      "video",
      "search",
      "invite",
    ]);
  });

  it("removes 'Davet et' rather than disabling it (§C1.3)", () => {
    assert.deepEqual(getGroupQuickActions({ canAddMembers: false }), ["mute", "video", "search"]);
  });
});

describe("getGroupMediaTiles", () => {
  const attachment = (id: string, contentType: string) => ({
    contentType,
    id,
    thumbnailUrl: null,
    url: `https://cdn.test/${id}`,
  });

  it("draws three attachments and a +N counter for the rest", () => {
    const tiles = getGroupMediaTiles(
      [
        attachment("1", "image/png"),
        attachment("2", "video/mp4"),
        attachment("3", "application/pdf"),
        attachment("4", "image/png"),
      ],
      48,
    );

    assert.deepEqual(
      tiles.map((tile) => tile.kind),
      ["image", "video", "file", "overflow"],
    );
    assert.equal(tiles[3]?.count, 45);
  });

  it("draws no counter when the strip already shows everything", () => {
    assert.deepEqual(
      getGroupMediaTiles([attachment("1", "image/png")], 1).map((tile) => tile.kind),
      ["image"],
    );
  });

  it("returns nothing for a conversation with no attachments", () => {
    assert.deepEqual(getGroupMediaTiles([], 0), []);
  });

  it("counts from the server total, not the page length", () => {
    assert.equal(getGroupMediaTiles([attachment("1", "image/png")], 9)[1]?.count, 8);
  });
});

describe("getGroupPermissionRows", () => {
  it("lists the four actions in the design's order", () => {
    assert.deepEqual(getGroupPermissionRows(permissions), [
      { action: "sendMessage", level: "ALL" },
      { action: "addMembers", level: "ALL" },
      { action: "editInfo", level: "ADMINS" },
      { action: "pinMessage", level: "ADMINS" },
    ]);
  });

  it("draws nothing for a 1:1 conversation", () => {
    assert.deepEqual(getGroupPermissionRows(undefined), []);
  });
});

describe("getGroupLeaveIntent", () => {
  it("asks a plain confirmation from an ordinary member", () => {
    assert.equal(getGroupLeaveIntent("MEMBER", [member("owner", { role: "OWNER" })]), "confirm");
  });

  it("asks the last owner to hand the group over first (V8)", () => {
    assert.equal(
      getGroupLeaveIntent("OWNER", [member("owner", { role: "OWNER" }), member("b")]),
      "transfer",
    );
  });

  it("lets an owner leave outright when another admin can take over", () => {
    assert.equal(
      getGroupLeaveIntent("OWNER", [
        member("owner", { role: "OWNER" }),
        member("b", { role: "ADMIN" }),
      ]),
      "confirm",
    );
  });

  it("lets the last person out without a transfer sheet", () => {
    assert.equal(getGroupLeaveIntent("OWNER", [member("owner", { role: "OWNER" })]), "confirm");
  });
});

describe("resolveGroupReadReceiptMessageId", () => {
  const outgoing = { author: { id: "me" }, id: "m1" };
  const incoming = { author: { id: "other" }, id: "m2" };

  it("names the last outgoing bubble", () => {
    assert.equal(resolveGroupReadReceiptMessageId([incoming, outgoing], "me"), "m1");
  });

  it("draws nothing when somebody else spoke last", () => {
    assert.equal(resolveGroupReadReceiptMessageId([outgoing, incoming], "me"), null);
  });

  it("ignores a system row that landed after the message", () => {
    assert.equal(
      resolveGroupReadReceiptMessageId(
        [outgoing, { author: { id: "other" }, id: "s1", systemType: "MEMBER_ADDED" }],
        "me",
      ),
      "m1",
    );
  });

  it("draws nothing in an empty transcript", () => {
    assert.equal(resolveGroupReadReceiptMessageId([], "me"), null);
  });
});

describe("getGroupReadStack", () => {
  const roster = [member("a"), member("b"), member("c"), member("d")];

  it("resolves reader ids against the roster the screen already holds", () => {
    assert.deepEqual(
      getGroupReadStack(["a", "b"], roster).map((entry) => entry.label),
      ["A", "B"],
    );
  });

  it("caps the stack at three faces", () => {
    assert.equal(getGroupReadStack(["a", "b", "c", "d"], roster).length, 3);
  });

  it("drops a reader who has left the group", () => {
    assert.deepEqual(
      getGroupReadStack(["a", "gone"], roster).map((entry) => entry.userId),
      ["a"],
    );
  });

  it("falls back to the username when there is no display name", () => {
    assert.equal(getGroupReadStack(["a"], [member("a", { displayName: null })])[0]?.label, "a");
  });

  it("returns nothing when nobody has read the message", () => {
    assert.deepEqual(getGroupReadStack([], roster), []);
  });
});

describe("buildLiveGroupReadReceipt", () => {
  const createdAt = "2026-08-12T09:00:00.000Z";
  const before = "2026-08-12T08:59:00.000Z";
  const after = "2026-08-12T09:00:01.000Z";

  it("counts only members whose read mark reaches the message", () => {
    const receipt = buildLiveGroupReadReceipt({
      createdAt,
      memberCount: 4,
      readStates: [
        { lastReadAt: after, userId: "a" },
        { lastReadAt: before, userId: "b" },
        { lastReadAt: null, userId: "c" },
      ],
      viewerId: "me",
    });

    assert.deepEqual(receipt.readerIds, ["a"]);
    assert.equal(receipt.count, 1);
    assert.equal(receipt.everyone, false);
  });

  it("never counts the author", () => {
    const receipt = buildLiveGroupReadReceipt({
      createdAt,
      memberCount: 2,
      readStates: [{ lastReadAt: after, userId: "me" }],
      viewerId: "me",
    });

    assert.equal(receipt.count, 0);
    assert.equal(receipt.everyone, false);
  });

  it("says everyone once every other member has read it", () => {
    const receipt = buildLiveGroupReadReceipt({
      createdAt,
      memberCount: 3,
      readStates: [
        { lastReadAt: after, userId: "a" },
        { lastReadAt: after, userId: "b" },
        { lastReadAt: after, userId: "me" },
      ],
      viewerId: "me",
    });

    assert.equal(receipt.count, 2);
    assert.equal(receipt.everyone, true);
  });

  it("stays empty when the timestamp cannot be read", () => {
    const receipt = buildLiveGroupReadReceipt({
      createdAt: "not-a-date",
      memberCount: 3,
      readStates: [{ lastReadAt: after, userId: "a" }],
      viewerId: "me",
    });

    assert.equal(receipt.count, 0);
  });
});
