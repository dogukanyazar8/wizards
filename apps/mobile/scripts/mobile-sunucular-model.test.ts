import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MobileNotificationItem, MobileWorkspaceChannelSummary } from "@wizards/types";
import {
  buildMobileCollapsedSectionKey,
  getMobileChannelRowPreview,
  getMobileChannelRowTone,
  getMobileMissedNotifications,
  getMobileOtherServersUnreadTotal,
  getMobileServerBadge,
  getMobileServerCreateAccess,
  getMobileVoiceParticipantTotal,
  getMobileVoiceRowPresence,
  hasMobileChannelNameCollision,
  parseMobileCollapsedSections,
  serializeMobileCollapsedSections,
  slugifyMobileChannelName,
  slugifyMobileChannelNameInput,
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
