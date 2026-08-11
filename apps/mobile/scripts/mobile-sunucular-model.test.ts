import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileNotificationItem, MobileWorkspaceChannelSummary } from "@wizards/types";
import {
  applyMobileLiveVoiceToProfile,
  buildMobileCollapsedSectionKey,
  buildMobileWorkspaceFilterKey,
  collectMobileLiveVoiceChannelIds,
  filterMobileWorkspaceSections,
  formatMobileChannelActivityLabel,
  shouldClaimMobileVoiceWatchTarget,
  shouldShowMobileDescriptionMore,
  splitMobileStrongSegments,
  formatMobileEventDateBlock,
  formatMobileEventDateTimeInput,
  formatMobileServerCreatedDate,
  getMobileCategoryHeaderState,
  getMobileChannelRowPreview,
  getMobileChannelRowTone,
  getMobileMissedNotifications,
  getMobileOtherServersUnreadTotal,
  getMobileProfileChannelPreview,
  getMobileServerAccessLabel,
  getMobileServerBadge,
  getMobileServerCreateAccess,
  getMobileServerNameLayout,
  getMobileServerProfileStats,
  getMobileVoiceParticipantTotal,
  getMobileVoiceRowPresence,
  getMobileWorkspaceUnreadChannelCount,
  groupMobileProfileChannelsByCategory,
  hasMobileChannelNameCollision,
  hasMobileWorkspaceLiveVoice,
  parseMobileCollapsedSections,
  parseMobileEventDateTimeInput,
  parseMobileWorkspaceFilters,
  resolveMobileEventAction,
  splitMobileServerEvents,
  serializeMobileCollapsedSections,
  serializeMobileWorkspaceFilters,
  setMobileWorkspaceFilter,
  slugifyMobileChannelName,
  slugifyMobileChannelNameInput,
  sortMobileServersByStar,
  toggleMobileCollapsedSection,
} from "../src/app/mobile-sunucular-model";

function channel(
  overrides: Partial<MobileWorkspaceChannelSummary> = {},
): MobileWorkspaceChannelSummary {
  return {
    categoryId: "category-lobby",
    categoryName: "Lobby",
    id: "channel-1",
    lastMessage: null,
    locked: false,
    mentionCount: 0,
    name: "development",
    position: 0,
    readOnly: false,
    topic: null,
    type: "TEXT",
    unreadCount: 0,
    ...overrides,
  } as MobileWorkspaceChannelSummary;
}

describe("getMobileServerBadge", () => {
  it("prefers a mention badge over unread", () => {
    assert.deepEqual(getMobileServerBadge({ mentionCount: 2, unreadCount: 9 }), {
      count: 2,
      kind: "mention",
    });
  });

  it("shows an unread badge when there are no mentions", () => {
    assert.deepEqual(getMobileServerBadge({ mentionCount: 0, unreadCount: 5 }), {
      count: 5,
      kind: "unread",
    });
  });

  it("shows nothing when the server is fully read", () => {
    assert.deepEqual(getMobileServerBadge({ mentionCount: 0, unreadCount: 0 }), { kind: "none" });
  });
});

describe("getMobileOtherServersUnreadTotal", () => {
  const servers = [
    { id: "a", unreadCount: 3 },
    { id: "b", unreadCount: 2 },
    { id: "c", unreadCount: 1 },
  ];

  it("sums the unread counts of every server except the active one", () => {
    assert.equal(getMobileOtherServersUnreadTotal(servers, "a"), 3);
  });

  it("sums every server when none is active", () => {
    assert.equal(getMobileOtherServersUnreadTotal(servers, null), 6);
  });

  it("returns zero for an empty list", () => {
    assert.equal(getMobileOtherServersUnreadTotal([], "a"), 0);
  });
});

describe("slugifyMobileChannelName", () => {
  it("lowercases and turns whitespace runs into single hyphens", () => {
    assert.equal(slugifyMobileChannelName("  Duyuru   Panosu "), "duyuru-panosu");
  });

  it("transliterates Turkish characters to ascii", () => {
    assert.equal(slugifyMobileChannelName("Release Notları"), "release-notlari");
    assert.equal(slugifyMobileChannelName("çğıöşü ÇĞİÖŞÜ"), "cgiosu-cgiosu");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    assert.equal(slugifyMobileChannelName("Ürün / Öneri"), "urun-oneri");
    assert.equal(slugifyMobileChannelName("---Hello---"), "hello");
  });

  it("returns an empty string for blank input", () => {
    assert.equal(slugifyMobileChannelName("   "), "");
  });
});

describe("slugifyMobileChannelNameInput", () => {
  it("keeps a trailing hyphen so a typed space stays visible mid-word", () => {
    assert.equal(slugifyMobileChannelNameInput("release "), "release-");
    assert.equal(slugifyMobileChannelNameInput("Release Notları"), "release-notlari");
  });

  it("trims only leading separators and transliterates", () => {
    assert.equal(slugifyMobileChannelNameInput("--Ürün Öneri"), "urun-oneri");
  });
});

describe("hasMobileChannelNameCollision", () => {
  const existing = ["welcome-chat", "development"];

  it("detects a collision regardless of casing or spacing", () => {
    assert.equal(hasMobileChannelNameCollision(existing, "Welcome Chat"), true);
    assert.equal(hasMobileChannelNameCollision(existing, "development"), true);
  });

  it("passes a unique name", () => {
    assert.equal(hasMobileChannelNameCollision(existing, "release-notes"), false);
  });

  it("treats a blank candidate as no collision", () => {
    assert.equal(hasMobileChannelNameCollision(existing, "   "), false);
  });
});

describe("getMobileMissedNotifications", () => {
  const make = (
    id: string,
    createdAt: string,
    overrides: Partial<MobileNotificationItem>,
  ): MobileNotificationItem => ({
    actionUrl: null,
    actor: null,
    badgeId: null,
    body: "body",
    channel: null,
    createdAt,
    eventKind: null,
    friendRequestId: null,
    id,
    messageQuote: null,
    read: false,
    readAt: null,
    server: null,
    serverInviteCode: null,
    type: "SYSTEM",
    ...overrides,
  });

  const mention = make("m", "2026-07-24T13:41:00.000Z", { type: "MENTION" });
  const voiceStart = make("v", "2026-07-24T13:12:00.000Z", {
    eventKind: "voice-room-started",
  });
  const reaction = make("r", "2026-07-24T13:50:00.000Z", {
    eventKind: "message-reaction",
  });
  const friend = make("f", "2026-07-24T14:00:00.000Z", { type: "FRIEND_REQUEST" });

  it("keeps only mentions and voice-room starts, newest first", () => {
    const result = getMobileMissedNotifications([voiceStart, reaction, mention, friend]);
    assert.deepEqual(
      result.map((item) => item.id),
      ["m", "v"],
    );
  });

  it("bounds the list to the requested limit", () => {
    const older = make("m2", "2026-07-24T10:00:00.000Z", { type: "MENTION" });
    const result = getMobileMissedNotifications([mention, voiceStart, older], { limit: 2 });
    assert.deepEqual(
      result.map((item) => item.id),
      ["m", "v"],
    );
  });

  it("drops anything already read, because that is no longer missed", () => {
    const readMention = make("m-read", "2026-07-24T15:00:00.000Z", {
      read: true,
      readAt: "2026-07-24T15:01:00.000Z",
      type: "MENTION",
    });
    const readVoice = make("v-read", "2026-07-24T15:02:00.000Z", {
      eventKind: "voice-room-started",
      read: true,
      readAt: "2026-07-24T15:03:00.000Z",
    });

    const result = getMobileMissedNotifications([readMention, readVoice, mention, voiceStart]);

    assert.deepEqual(
      result.map((item) => item.id),
      ["m", "v"],
    );
    assert.deepEqual(getMobileMissedNotifications([readMention, readVoice]), []);
  });
});

describe("getMobileServerCreateAccess", () => {
  it("grants access only when channel management is allowed", () => {
    assert.equal(getMobileServerCreateAccess({ canManageChannels: true }), true);
    assert.equal(getMobileServerCreateAccess({ canManageChannels: false }), false);
  });

  it("denies access when capabilities are missing", () => {
    assert.equal(getMobileServerCreateAccess(null), false);
    assert.equal(getMobileServerCreateAccess(undefined), false);
  });
});

describe("getMobileVoiceParticipantTotal", () => {
  it("sums participants across every voice channel", () => {
    assert.equal(
      getMobileVoiceParticipantTotal([
        { participants: [{}, {}] },
        { participants: [{}] },
        { participants: [] },
      ]),
      3,
    );
  });
});

describe("getMobileChannelRowTone", () => {
  it("treats the open channel as active whatever its counters say", () => {
    assert.equal(
      getMobileChannelRowTone(channel({ mentionCount: 4, unreadCount: 9 }), true),
      "active",
    );
  });

  it("ranks mention over unread and unread over read", () => {
    assert.equal(
      getMobileChannelRowTone(channel({ mentionCount: 1, unreadCount: 3 }), false),
      "mention",
    );
    assert.equal(getMobileChannelRowTone(channel({ unreadCount: 3 }), false), "unread");
    assert.equal(getMobileChannelRowTone(channel(), false), "read");
  });
});

describe("getMobileChannelRowPreview", () => {
  const lastMessage = {
    author: { displayName: "DY", id: "user-dy", username: "dogukanyazar" },
    createdAt: "2026-07-16T10:41:00.000Z",
    id: "message-1",
    text: "@dogukanyazar build hazır mı?",
  };

  it("splits the preview into the author label and mention-aware segments", () => {
    assert.deepEqual(getMobileChannelRowPreview(channel({ lastMessage })), {
      author: "DY",
      segments: [
        { type: "mention", username: "dogukanyazar", value: "@dogukanyazar" },
        { type: "text", value: " build hazır mı?" },
      ],
    });
  });

  it("falls back to the username when the author has no display name", () => {
    const preview = getMobileChannelRowPreview(
      channel({
        lastMessage: {
          ...lastMessage,
          author: { ...lastMessage.author, displayName: null },
          text: "megadeth",
        },
      }),
    );

    assert.equal(preview?.author, "dogukanyazar");
    assert.deepEqual(preview?.segments, [{ type: "text", value: "megadeth" }]);
  });

  it("has no preview for voice channels or channels without a message", () => {
    assert.equal(getMobileChannelRowPreview(channel({ lastMessage, type: "VOICE" })), null);
    assert.equal(getMobileChannelRowPreview(channel()), null);
  });
});

describe("getMobileVoiceRowPresence", () => {
  const participants = [
    { displayName: "Ayşegül", userId: "user-1", username: "aysegul_dev" },
    { displayName: null, userId: "user-2", username: "dogukanyazar" },
  ];

  it("counts people for the rail row (1a)", () => {
    assert.deepEqual(getMobileVoiceRowPresence(participants, "rail"), { count: 2, kind: "count" });
  });

  it("names people for the compact row (1b)", () => {
    assert.deepEqual(getMobileVoiceRowPresence(participants, "compact"), {
      kind: "names",
      names: ["Ayşegül", "dogukanyazar"],
    });
  });

  it("falls back to the count when a room is too crowded to name", () => {
    const crowded = [
      ...participants,
      { displayName: null, userId: "user-3", username: "c" },
      { displayName: null, userId: "user-4", username: "d" },
    ];

    assert.deepEqual(getMobileVoiceRowPresence(crowded, "compact"), { count: 4, kind: "count" });
  });
});

describe("collapsed section persistence", () => {
  it("builds a per-server section key", () => {
    assert.equal(buildMobileCollapsedSectionKey("server-1", "lobby"), "server-1:lobby");
  });

  it("parses only truthy entries and ignores malformed json", () => {
    assert.deepEqual(parseMobileCollapsedSections('{"a:b":true,"c:d":false}'), { "a:b": true });
    assert.deepEqual(parseMobileCollapsedSections("not json"), {});
    assert.deepEqual(parseMobileCollapsedSections(null), {});
  });

  it("toggles a section on and drops it when toggled off", () => {
    const collapsed = toggleMobileCollapsedSection({}, "a:b");
    assert.deepEqual(collapsed, { "a:b": true });
    assert.deepEqual(toggleMobileCollapsedSection(collapsed, "a:b"), {});
  });

  it("round-trips through serialization", () => {
    const map = { "a:b": true };
    assert.deepEqual(parseMobileCollapsedSections(serializeMobileCollapsedSections(map)), map);
  });
});

function section(id: string, name: string, channels: MobileWorkspaceChannelSummary[]) {
  return { channels, id, name };
}

describe("filterMobileWorkspaceSections", () => {
  const lobby = section("lobby", "Lobby", [
    channel({ id: "general", name: "general" }),
    channel({ id: "duyurular", name: "duyurular", unreadCount: 4 }),
    channel({ id: "lobi-ses", name: "lobi-ses", type: "VOICE" }),
    channel({ id: "sahne", name: "sahne", type: "VOICE" }),
  ]);
  const paycore = section("paycore", "Paycore", [
    channel({ id: "paycore-dev", mentionCount: 2, name: "dev" }),
  ]);
  const archive = section("archive", "Arşiv", [channel({ id: "eski", name: "eski" })]);
  const sections = [lobby, paycore, archive];
  const voiceStates = [{ channelId: "sahne", participants: [{}, {}] }];

  it("returns every section untouched for the all filter", () => {
    assert.deepEqual(filterMobileWorkspaceSections(sections, "all", voiceStates), sections);
  });

  // A0.1: "Tümü" is the default and the tab re-renders on every presence tick.
  // A copy here would hand FlashList a new reference each time and kill its
  // bail-out, so the identity is asserted, not the contents.
  it("hands back the same array reference for the all filter", () => {
    assert.equal(filterMobileWorkspaceSections(sections, "all", voiceStates), sections);
  });

  it("accepts a prebuilt live-voice set instead of the raw states", () => {
    const liveVoiceChannelIds = collectMobileLiveVoiceChannelIds(voiceStates);
    const result = filterMobileWorkspaceSections(sections, "voice", liveVoiceChannelIds);

    assert.deepEqual(
      result[0]?.channels.map((entry) => entry.id),
      ["sahne", "lobi-ses"],
    );
  });

  it("keeps only unread or mentioned channels and drops the categories they emptied", () => {
    const result = filterMobileWorkspaceSections(sections, "unread", voiceStates);

    assert.deepEqual(
      result.map((entry) => entry.id),
      ["lobby", "paycore"],
    );
    assert.deepEqual(
      result[0]?.channels.map((entry) => entry.id),
      ["duyurular"],
    );
  });

  it("keeps only voice channels and floats the live ones to the top of their category", () => {
    const result = filterMobileWorkspaceSections(sections, "voice", voiceStates);

    assert.deepEqual(
      result.map((entry) => entry.id),
      ["lobby"],
    );
    assert.deepEqual(
      result[0]?.channels.map((entry) => entry.id),
      ["sahne", "lobi-ses"],
    );
  });
});

describe("getMobileWorkspaceUnreadChannelCount", () => {
  it("counts every channel carrying an unread or a mention", () => {
    assert.equal(
      getMobileWorkspaceUnreadChannelCount([
        section("a", "A", [channel({ id: "1", unreadCount: 3 }), channel({ id: "2" })]),
        section("b", "B", [channel({ id: "3", mentionCount: 1 })]),
      ]),
      2,
    );
  });

  it("returns zero for a fully read server so the badge hides", () => {
    assert.equal(getMobileWorkspaceUnreadChannelCount([section("a", "A", [channel()])]), 0);
  });
});

describe("hasMobileWorkspaceLiveVoice", () => {
  const sections = [
    section("a", "A", [channel({ id: "text" }), channel({ id: "voice-1", type: "VOICE" })]),
  ];

  it("is true when one of this server's voice channels has people in it", () => {
    assert.equal(
      hasMobileWorkspaceLiveVoice(sections, [{ channelId: "voice-1", participants: [{}] }]),
      true,
    );
  });

  it("ignores a live room that belongs to another server", () => {
    assert.equal(
      hasMobileWorkspaceLiveVoice(sections, [{ channelId: "elsewhere", participants: [{}] }]),
      false,
    );
  });

  it("is false when every room is empty", () => {
    assert.equal(
      hasMobileWorkspaceLiveVoice(sections, [{ channelId: "voice-1", participants: [] }]),
      false,
    );
  });

  // A0.2: the screen builds the set once and feeds both helpers from it.
  it("accepts the same prebuilt set the filter takes", () => {
    const liveVoiceChannelIds = collectMobileLiveVoiceChannelIds([
      { channelId: "voice-1", participants: [{}] },
    ]);

    assert.equal(hasMobileWorkspaceLiveVoice(sections, liveVoiceChannelIds), true);
    assert.equal(hasMobileWorkspaceLiveVoice(sections, new Set<string>()), false);
  });
});

describe("collectMobileLiveVoiceChannelIds", () => {
  it("keeps only the rooms that actually have people in them", () => {
    assert.deepEqual(
      [
        ...collectMobileLiveVoiceChannelIds([
          { channelId: "live", participants: [{}] },
          { channelId: "empty", participants: [] },
        ]),
      ],
      ["live"],
    );
  });
});

describe("workspace filter persistence", () => {
  it("builds a per-user, per-server key", () => {
    assert.equal(buildMobileWorkspaceFilterKey("user-1", "server-1"), "user-1:server-1");
  });

  it("parses only known filter ids and survives malformed json", () => {
    assert.deepEqual(parseMobileWorkspaceFilters('{"u:s":"voice","x:y":"nope"}'), {
      "u:s": "voice",
    });
    assert.deepEqual(parseMobileWorkspaceFilters("not json"), {});
    assert.deepEqual(parseMobileWorkspaceFilters(null), {});
  });

  it("stores a non-default filter and drops the entry when it returns to all", () => {
    const stored = setMobileWorkspaceFilter({}, "u:s", "unread");
    assert.deepEqual(stored, { "u:s": "unread" });
    assert.deepEqual(setMobileWorkspaceFilter(stored, "u:s", "all"), {});
  });

  it("round-trips through serialization", () => {
    const map = { "u:s": "voice" } as const;
    assert.deepEqual(parseMobileWorkspaceFilters(serializeMobileWorkspaceFilters(map)), map);
  });
});

describe("getMobileServerNameLayout", () => {
  it("clamps the 6a header name at two lines instead of truncating it", () => {
    assert.deepEqual(getMobileServerNameLayout("Paycore Mobil Ürün Ekibi 2025", "header"), {
      fontSize: 19,
      letterSpacing: -0.19,
      lineHeight: 22.4,
      numberOfLines: 2,
    });
  });

  it("uses the compact card metrics for 6b/6c", () => {
    assert.deepEqual(getMobileServerNameLayout("Mobile Test Server", "card"), {
      fontSize: 15.5,
      letterSpacing: 0,
      lineHeight: 18.6,
      numberOfLines: 2,
    });
  });

  it("keeps the 6e sticky header on a single line", () => {
    assert.equal(getMobileServerNameLayout("Mobile Test Server", "sticky").numberOfLines, 1);
    assert.equal(getMobileServerNameLayout("Mobile Test Server", "sticky").fontSize, 15);
  });

  it("uses the 6d profile metrics", () => {
    assert.deepEqual(getMobileServerNameLayout("Mobile Test Server", "profile"), {
      fontSize: 22,
      letterSpacing: -0.44,
      lineHeight: 25.3,
      numberOfLines: 2,
    });
  });

  it("asks for a single line when there is no name to wrap", () => {
    assert.equal(getMobileServerNameLayout("   ", "header").numberOfLines, 1);
  });
});

describe("getMobileCategoryHeaderState", () => {
  const populated = section("lobby", "Lobby", [
    channel({ id: "1", unreadCount: 2 }),
    channel({ id: "2" }),
  ]);
  const read = section("lobby", "Lobby", [channel({ id: "1" })]);

  it("points the chevron down and keeps the idle tone while open", () => {
    assert.deepEqual(getMobileCategoryHeaderState(populated, false), {
      channelCount: 2,
      chevronRotation: "0deg",
      isCollapsed: false,
      showUnreadDot: false,
      tone: "idle",
    });
  });

  it("rotates the chevron and marks unread once collapsed", () => {
    assert.deepEqual(getMobileCategoryHeaderState(populated, true), {
      channelCount: 2,
      chevronRotation: "-90deg",
      isCollapsed: true,
      showUnreadDot: true,
      tone: "collapsed",
    });
  });

  it("shows no dot when the collapsed category is fully read", () => {
    assert.equal(getMobileCategoryHeaderState(read, true).showUnreadDot, false);
  });

  it("treats an empty category as collapsed whatever the stored state says", () => {
    const empty = getMobileCategoryHeaderState(section("empty", "Boş", []), false);
    assert.equal(empty.isCollapsed, true);
    assert.equal(empty.chevronRotation, "-90deg");
    assert.equal(empty.channelCount, 0);
  });
});

describe("getMobileServerProfileStats", () => {
  it("returns the four 6d cells in design order", () => {
    assert.deepEqual(
      getMobileServerProfileStats({
        channelCount: 7,
        memberCount: 5,
        voiceActiveCount: 2,
        weeklyMessageCount: 142,
      }),
      [
        { id: "members", value: "5" },
        { id: "channels", value: "7" },
        { id: "voice", value: "2" },
        { id: "weekly", value: "142" },
      ],
    );
  });

  it("renders an em dash when the weekly count could not be produced", () => {
    const stats = getMobileServerProfileStats({
      channelCount: 7,
      memberCount: 5,
      voiceActiveCount: 0,
      weeklyMessageCount: null,
    });

    assert.equal(stats[3]?.value, "—");
  });
});

describe("groupMobileProfileChannelsByCategory", () => {
  const channels = [
    { categoryId: "lobby", categoryName: "Lobby", id: "c1" },
    { categoryId: null, categoryName: null, id: "c2" },
    { categoryId: "paycore", categoryName: "Paycore", id: "c3" },
    { categoryId: "lobby", categoryName: "Lobby", id: "c4" },
  ];

  it("keeps the service's ordering and pushes uncategorised channels to the end", () => {
    assert.deepEqual(
      groupMobileProfileChannelsByCategory(channels).map((group) => ({
        id: group.categoryId,
        ids: group.channels.map((entry) => entry.id),
      })),
      [
        { id: "lobby", ids: ["c1", "c4"] },
        { id: "paycore", ids: ["c3"] },
        { id: null, ids: ["c2"] },
      ],
    );
  });
});

describe("getMobileProfileChannelPreview", () => {
  const groups = groupMobileProfileChannelsByCategory([
    { categoryId: "lobby", categoryName: "Lobby", id: "c1" },
    { categoryId: "lobby", categoryName: "Lobby", id: "c2" },
    { categoryId: "paycore", categoryName: "Paycore", id: "c3" },
    { categoryId: "paycore", categoryName: "Paycore", id: "c4" },
  ]);

  it("cuts the preview at the limit and reports what is left behind", () => {
    const preview = getMobileProfileChannelPreview(groups, 3);

    assert.deepEqual(
      preview.groups.map((group) => group.channels.map((entry) => entry.id)),
      [["c1", "c2"], ["c3"]],
    );
    assert.equal(preview.remaining, 1);
  });

  it("leaves nothing behind when the list already fits", () => {
    const preview = getMobileProfileChannelPreview(groups, 9);

    assert.equal(preview.remaining, 0);
    assert.equal(preview.groups.length, 2);
  });
});

describe("resolveMobileEventAction", () => {
  const start = Date.parse("2026-08-12T16:00:00.000Z");

  it("offers Katıl inside the 15 minute window and after the start", () => {
    assert.equal(
      resolveMobileEventAction(
        { scheduledStartAt: "2026-08-12T16:00:00.000Z", status: "SCHEDULED" },
        start - 14 * 60_000,
      )?.kind,
      "join",
    );
    assert.equal(
      resolveMobileEventAction(
        { scheduledStartAt: "2026-08-12T16:00:00.000Z", status: "ACTIVE" },
        start + 60_000,
      )?.kind,
      "join",
    );
  });

  it("offers Hatırlat while the start is further out", () => {
    assert.equal(
      resolveMobileEventAction(
        { scheduledStartAt: "2026-08-12T16:00:00.000Z", status: "SCHEDULED" },
        start - 16 * 60_000,
      )?.kind,
      "remind",
    );
  });

  it("hides the button for a cancelled event", () => {
    assert.equal(
      resolveMobileEventAction(
        { scheduledStartAt: "2026-08-12T16:00:00.000Z", status: "CANCELLED" },
        start,
      ),
      null,
    );
  });
});

describe("formatMobileEventDateBlock", () => {
  const at = (year: number, month: number, day: number, hour: number, minute: number) =>
    new Date(year, month, day, hour, minute);

  it("labels an event starting later today", () => {
    const now = at(2026, 7, 12, 9, 0);
    const event = { scheduledStartAt: at(2026, 7, 12, 16, 0).toISOString() };

    assert.deepEqual(formatMobileEventDateBlock(event, now.getTime(), "tr"), {
      label: "BUGÜN",
      time: "16:00",
    });
  });

  it("labels tomorrow in both languages", () => {
    const now = at(2026, 7, 12, 9, 0);
    const event = { scheduledStartAt: at(2026, 7, 13, 9, 5).toISOString() };

    assert.equal(formatMobileEventDateBlock(event, now.getTime(), "tr").label, "YARIN");
    assert.equal(formatMobileEventDateBlock(event, now.getTime(), "en").label, "TOMORROW");
  });

  it("falls back to a day and a month abbreviation further out", () => {
    const now = at(2026, 1, 20, 9, 0);
    const event = { scheduledStartAt: at(2026, 2, 12, 8, 5).toISOString() };

    assert.deepEqual(formatMobileEventDateBlock(event, now.getTime(), "tr"), {
      label: "12 MAR",
      time: "08:05",
    });
    assert.equal(formatMobileEventDateBlock(event, now.getTime(), "en").label, "12 MAR");
  });
});

describe("getMobileServerAccessLabel", () => {
  const labels = {
    serverAccessApproval: "Onaylı",
    serverAccessInvite: "Davetle",
    serverAccessPublic: "Herkese açık",
  };

  it("maps every access level to its own label", () => {
    assert.equal(getMobileServerAccessLabel("invite", labels), "Davetle");
    assert.equal(getMobileServerAccessLabel("public", labels), "Herkese açık");
    assert.equal(getMobileServerAccessLabel("approval", labels), "Onaylı");
  });
});

describe("sortMobileServersByStar", () => {
  it("lifts starred servers without disturbing the order underneath", () => {
    assert.deepEqual(
      sortMobileServersByStar([
        { id: "a", starred: false },
        { id: "b", starred: true },
        { id: "c", starred: false },
        { id: "d", starred: true },
      ]).map((server) => server.id),
      ["b", "d", "a", "c"],
    );
  });
});

/** Local wall-clock construction: these formatters all read the device timezone. */
const at = (year: number, month: number, day: number, hour: number, minute: number) =>
  new Date(year, month, day, hour, minute, 0, 0);

describe("formatMobileChannelActivityLabel", () => {
  it("prints a day and a title-case month, never uppercased in JS", () => {
    const activity = at(2026, 6, 31, 12, 0).toISOString();

    assert.equal(formatMobileChannelActivityLabel(activity, "tr"), "31 Tem");
    assert.equal(formatMobileChannelActivityLabel(activity, "en"), "31 Jul");
  });

  it("prints nothing for a channel that has never had activity", () => {
    assert.equal(formatMobileChannelActivityLabel(null, "tr"), "");
    assert.equal(formatMobileChannelActivityLabel("not-a-date", "tr"), "");
  });
});

describe("formatMobileServerCreatedDate", () => {
  it("writes the long form each language actually uses", () => {
    const created = at(2025, 2, 12, 10, 0).toISOString();

    assert.equal(formatMobileServerCreatedDate(created, "tr"), "12 Mart 2025");
    assert.equal(formatMobileServerCreatedDate(created, "en"), "March 12, 2025");
  });
});

describe("splitMobileServerEvents", () => {
  const event = (id: string, status: string, day: number) => ({
    id,
    scheduledStartAt: at(2026, 7, day, 18, 0).toISOString(),
    status,
  });

  it("splits on status, not on the clock, and orders each side its own way", () => {
    const { past, upcoming } = splitMobileServerEvents([
      event("b", "SCHEDULED", 20),
      event("old", "COMPLETED", 2),
      event("a", "ACTIVE", 12),
      event("cancelled", "CANCELLED", 9),
    ]);

    assert.deepEqual(
      upcoming.map((entry) => entry.id),
      ["a", "b"],
    );
    assert.deepEqual(
      past.map((entry) => entry.id),
      ["cancelled", "old"],
    );
  });
});

describe("mobile event date-time input", () => {
  it("round-trips a local instant through the text field format", () => {
    const iso = parseMobileEventDateTimeInput("12.03.2026 18:30");

    assert.ok(iso);
    assert.equal(formatMobileEventDateTimeInput(iso), "12.03.2026 18:30");
    assert.equal(new Date(iso).getHours(), 18);
  });

  it("refuses anything it cannot read rather than guessing a nearby date", () => {
    for (const input of ["12 Mart", "2026-03-12 18:30", "31.02.2026 10:00", "12.13.2026 10:00"]) {
      assert.equal(parseMobileEventDateTimeInput(input), null, input);
    }
  });

  it("prints an empty field for a missing value", () => {
    assert.equal(formatMobileEventDateTimeInput(null), "");
    assert.equal(formatMobileEventDateTimeInput("nope"), "");
  });
});

/**
 * The Sunucular list is the screen a cold launch lands on, and until it names a
 * server the realtime client emits no `voice:states:watch` — every live figure
 * on 6a, 6b and 6d froze at the first HTTP read.
 */
describe("shouldClaimMobileVoiceWatchTarget", () => {
  const empty = { channelId: null, conversationId: null, serverId: null };

  it("claims an unclaimed target", () => {
    assert.equal(shouldClaimMobileVoiceWatchTarget(empty, "server-1"), true);
  });

  it("re-claims when the rail switches servers", () => {
    assert.equal(
      shouldClaimMobileVoiceWatchTarget({ ...empty, serverId: "server-1" }, "server-2"),
      true,
    );
  });

  it("does not rewrite the server it already holds", () => {
    assert.equal(
      shouldClaimMobileVoiceWatchTarget({ ...empty, serverId: "server-1" }, "server-1"),
      false,
    );
  });

  it("yields to an open channel or DM, whose screen owns the target", () => {
    assert.equal(
      shouldClaimMobileVoiceWatchTarget(
        { ...empty, channelId: "c1", serverId: "server-1" },
        "server-2",
      ),
      false,
    );
    assert.equal(
      shouldClaimMobileVoiceWatchTarget({ ...empty, conversationId: "d1" }, "server-1"),
      false,
    );
  });

  it("claims nothing without a server", () => {
    assert.equal(shouldClaimMobileVoiceWatchTarget(empty, null), false);
    assert.equal(shouldClaimMobileVoiceWatchTarget(empty, ""), false);
  });
});

describe("applyMobileLiveVoiceToProfile", () => {
  type ProfileChannel = {
    readonly id: string;
    readonly liveCount: number | null;
    readonly participants: readonly {
      readonly avatarUrl: string | null;
      readonly displayName: string;
      readonly id: string;
      readonly shortName: string | null;
    }[];
    readonly type: "text" | "voice";
  };
  const profile: { channels: readonly ProfileChannel[]; voiceActiveCount: number } = {
    channels: [
      { id: "voice-1", liveCount: 0, participants: [], type: "voice" },
      { id: "text-1", liveCount: null, participants: [], type: "text" },
    ],
    voiceActiveCount: 0,
  };

  it("leaves the snapshot alone until the voice read answers", () => {
    assert.equal(applyMobileLiveVoiceToProfile(profile, null), profile);
  });

  it("fills a room from the live map and totals the server", () => {
    const next = applyMobileLiveVoiceToProfile(
      profile,
      new Map([
        [
          "voice-1",
          [
            { avatarUrl: null, displayName: "Ada Lovelace", userId: "u1", username: "ada" },
            { avatarUrl: null, displayName: null, userId: "u2", username: "zoe" },
          ],
        ],
      ]),
    );

    assert.equal(next.voiceActiveCount, 2);
    assert.equal(next.channels[0]?.liveCount, 2);
    assert.deepEqual(
      next.channels[0]?.participants.map((participant) => participant.shortName),
      ["AL", "Z"],
    );
    // A username stands in for a missing display name rather than an empty row.
    assert.equal(next.channels[0]?.participants[1]?.displayName, "zoe");
  });

  it("empties a room the live map no longer lists", () => {
    const busy = applyMobileLiveVoiceToProfile(
      profile,
      new Map([
        ["voice-1", [{ avatarUrl: null, displayName: "Ada", userId: "u1", username: "ada" }]],
      ]),
    );
    const quiet = applyMobileLiveVoiceToProfile(busy, new Map());

    assert.equal(quiet.voiceActiveCount, 0);
    assert.deepEqual(quiet.channels[0]?.participants, []);
  });

  it("returns the same object when nothing moved, so the screen does not re-render", () => {
    assert.equal(applyMobileLiveVoiceToProfile(profile, new Map()), profile);
  });

  it("never touches a text channel", () => {
    const next = applyMobileLiveVoiceToProfile(
      profile,
      new Map([
        ["voice-1", [{ avatarUrl: null, displayName: "Ada", userId: "u1", username: "ada" }]],
      ]),
    );

    assert.equal(next.channels[1], profile.channels[1]);
  });
});

describe("splitMobileStrongSegments", () => {
  it("splits 6d's friends line around its bold counter", () => {
    assert.deepEqual(splitMobileStrongSegments("Arkadaşlarından **3 kişi** bu sunucuda"), [
      { strong: false, text: "Arkadaşlarından " },
      { strong: true, text: "3 kişi" },
      { strong: false, text: " bu sunucuda" },
    ]);
  });

  it("handles a sentence that opens on the bold span", () => {
    assert.deepEqual(splitMobileStrongSegments("**3 of your friends** are here"), [
      { strong: true, text: "3 of your friends" },
      { strong: false, text: " are here" },
    ]);
  });

  it("returns unmarked copy as one plain segment", () => {
    assert.deepEqual(splitMobileStrongSegments("no markers"), [
      { strong: false, text: "no markers" },
    ]);
  });

  it("keeps an unpaired marker literal rather than swallowing the rest", () => {
    assert.deepEqual(splitMobileStrongSegments("half **open"), [
      { strong: false, text: "half **open" },
    ]);
  });
});

describe("shouldShowMobileDescriptionMore", () => {
  it("stays hidden until the description has been measured", () => {
    assert.equal(
      shouldShowMobileDescriptionMore({ expanded: false, lineCount: null, maxLines: 3 }),
      false,
    );
  });

  it("stays hidden for a description that fits inside the clamp", () => {
    assert.equal(
      shouldShowMobileDescriptionMore({ expanded: false, lineCount: 1, maxLines: 3 }),
      false,
    );
    // Exactly at the limit is still nothing to reveal.
    assert.equal(
      shouldShowMobileDescriptionMore({ expanded: false, lineCount: 3, maxLines: 3 }),
      false,
    );
  });

  it("appears only when a line is actually being hidden", () => {
    assert.equal(
      shouldShowMobileDescriptionMore({ expanded: false, lineCount: 4, maxLines: 3 }),
      true,
    );
  });

  it("disappears once the reader has expanded it", () => {
    assert.equal(
      shouldShowMobileDescriptionMore({ expanded: true, lineCount: 9, maxLines: 3 }),
      false,
    );
  });
});
