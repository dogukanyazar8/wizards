import { describe, expect, it } from "@jest/globals";
import type { MobileNotificationItem } from "@wizards/types";
import {
  getMobileNotificationPresentation,
  groupMobileNotificationsByDay,
} from "../src/app/screens/notifications-screen-model";

const now = new Date("2026-07-16T12:00:00.000Z");

const todayMention: MobileNotificationItem = {
  actionUrl: "/channels/server-1/channel-1",
  actor: { avatarUrl: null, displayName: "Ada", id: "user-1", username: "ada" },
  body: "Ada seni etiketledi",
  channel: { id: "channel-1", name: "general" },
  createdAt: "2026-07-16T10:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000001",
  messageQuote: { id: "message-1", preview: "Lütfen buna bak" },
  read: false,
  readAt: null,
  server: { id: "server-1", name: "Whispr" },
  type: "MENTION",
};

const yesterdayInvite: MobileNotificationItem = {
  ...todayMention,
  createdAt: "2026-07-15T10:00:00.000Z",
  id: "00000000-0000-4000-8000-000000000002",
  read: true,
  type: "SERVER_INVITE",
};

const voiceRoomStarted = {
  ...todayMention,
  eventKind: "voice-room-started" as const,
  id: "00000000-0000-4000-8000-000000000003",
  type: "SYSTEM" as const,
};

const reaction = { ...todayMention, eventKind: "message-reaction" as const };
const serverMemberJoined = { ...todayMention, eventKind: "server-member-joined" as const };

describe("1d notification presentation model", () => {
  it("groups only real notifications by their local calendar day", () => {
    expect(groupMobileNotificationsByDay([todayMention, yesterdayInvite], now)).toEqual([
      { label: "BUGÜN", notifications: [todayMention] },
      { label: "DÜN", notifications: [yesterdayInvite] },
    ]);
  });

  it("derives mention presentation from the typed API record without parsing copy", () => {
    expect(getMobileNotificationPresentation(todayMention)).toMatchObject({
      canJoinVoice: false,
      icon: "at-outline",
      kind: "mention",
    });
  });

  it("renders a join affordance only for a real voice-room event with channel context", () => {
    expect(getMobileNotificationPresentation(voiceRoomStarted)).toMatchObject({
      canJoinVoice: true,
      icon: "volume-high-outline",
      kind: "voice",
    });
  });

  it("suppresses a voice join when the API did not resolve its server context", () => {
    expect(
      getMobileNotificationPresentation({ ...voiceRoomStarted, server: null }).canJoinVoice,
    ).toBe(false);
  });

  it("renders structured reaction and server-member events without parsing their body copy", () => {
    expect(getMobileNotificationPresentation(reaction).kind).toBe("reaction");
    expect(getMobileNotificationPresentation(serverMemberJoined).kind).toBe("server-member");
  });
});
