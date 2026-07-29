import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DMConversationDTO, MobileWorkspaceChannelSummary } from "@wizards/types";
import { resolveMobileActiveTextChannel } from "../src/app/mobile-display-model";
import { toMobileDMConversationSummaryFromStream } from "../src/dm/mobile-dm-client";

function buildChannel(
  overrides: Partial<MobileWorkspaceChannelSummary> = {},
): MobileWorkspaceChannelSummary {
  return {
    categoryId: null,
    categoryName: null,
    id: "channel-1",
    lastMessage: null,
    locked: false,
    mentionCount: 0,
    name: "genel",
    position: 0,
    readOnly: false,
    topic: null,
    type: "TEXT",
    unreadCount: 0,
    ...overrides,
  };
}

function buildStreamConversation(overrides: Partial<DMConversationDTO> = {}): DMConversationDTO {
  return {
    id: "conversation-1",
    lastMessage: null,
    lastMessageAt: "2026-07-28T09:00:00.000Z",
    name: null,
    participants: [
      {
        avatarUrl: "https://cdn.whispr.team/ada.png",
        customStatus: null,
        displayName: "Ada",
        muted: false,
        presence: { customStatus: null, status: "ONLINE" },
        status: "ONLINE",
        unreadCount: 0,
        userId: "user-ada",
        username: "ada",
      },
      {
        avatarUrl: null,
        customStatus: null,
        displayName: null,
        muted: true,
        presence: { customStatus: null, status: "IDLE" },
        status: "IDLE",
        unreadCount: 4,
        userId: "viewer",
        username: "viewer",
      },
    ],
    type: "DM",
    ...overrides,
  };
}

describe("resolveMobileActiveTextChannel", () => {
  it("resolves nothing while no channel is active", () => {
    assert.equal(
      resolveMobileActiveTextChannel({
        activeChannelId: null,
        detailChannels: [buildChannel()],
        streamChannel: buildChannel(),
      }),
      null,
    );
  });

  it("prefers the server detail entry because it carries the unread counters", () => {
    const detailChannel = buildChannel({ mentionCount: 2, unreadCount: 7 });
    const resolved = resolveMobileActiveTextChannel({
      activeChannelId: "channel-1",
      detailChannels: [detailChannel],
      streamChannel: buildChannel({ mentionCount: 0, unreadCount: 0 }),
    });

    assert.equal(resolved, detailChannel);
  });

  it("falls back to the message stream's channel before the detail read lands", () => {
    const streamChannel = buildChannel({ name: "duyurular" });
    const resolved = resolveMobileActiveTextChannel({
      activeChannelId: "channel-1",
      detailChannels: [],
      streamChannel,
    });

    assert.equal(resolved, streamChannel);
  });

  it("ignores a stream channel that belongs to another route", () => {
    assert.equal(
      resolveMobileActiveTextChannel({
        activeChannelId: "channel-2",
        detailChannels: [],
        streamChannel: buildChannel({ id: "channel-1" }),
      }),
      null,
    );
  });

  it("ignores a non-text stream channel", () => {
    assert.equal(
      resolveMobileActiveTextChannel({
        activeChannelId: "channel-1",
        detailChannels: [],
        streamChannel: buildChannel({ type: "VOICE" }),
      }),
      null,
    );
  });

  it("trusts the detail read when it says the id is not a text channel", () => {
    assert.equal(
      resolveMobileActiveTextChannel({
        activeChannelId: "channel-1",
        detailChannels: [buildChannel({ type: "VOICE" })],
        streamChannel: buildChannel({ type: "TEXT" }),
      }),
      null,
    );
  });
});

describe("toMobileDMConversationSummaryFromStream", () => {
  it("adapts the stream conversation into a list summary", () => {
    const summary = toMobileDMConversationSummaryFromStream(
      buildStreamConversation({ name: "Ada & viewer" }),
      "viewer",
    );

    assert.equal(summary.id, "conversation-1");
    assert.equal(summary.name, "Ada & viewer");
    assert.equal(summary.type, "DM");
    assert.equal(summary.lastMessageAt, "2026-07-28T09:00:00.000Z");
    assert.equal(summary.iconUrl, null);
    assert.equal(summary.lastMessage, null);
    assert.equal(summary.mentionCount, 0);
    assert.equal(summary.participantCount, 2);
    assert.deepEqual(
      summary.participants.map((participant) => participant.id),
      ["user-ada", "viewer"],
    );
    assert.equal(summary.participants[0]?.username, "ada");
    assert.equal(summary.participants[0]?.displayName, "Ada");
    assert.equal(summary.participants[0]?.avatarUrl, "https://cdn.whispr.team/ada.png");
    assert.equal(summary.participants[0]?.status, "ONLINE");
    assert.equal(summary.participants[0]?.isBot, false);
  });

  it("reads the unread count and mute flag off the viewer's participant row", () => {
    const summary = toMobileDMConversationSummaryFromStream(buildStreamConversation(), "viewer");

    assert.equal(summary.unreadCount, 4);
    assert.equal(summary.muted, true);
  });

  it("stays neutral when the viewer is not in the participant list", () => {
    const summary = toMobileDMConversationSummaryFromStream(buildStreamConversation(), null);

    assert.equal(summary.unreadCount, 0);
    assert.equal(summary.muted, false);
  });
});
