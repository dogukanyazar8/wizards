import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMobileBootstrapPayload } from "./bootstrap";

describe("mobile bootstrap payload", () => {
  it("returns a schema-valid payload without emails, tokens, or fake pending features", () => {
    const payload = getMobileBootstrapPayload({
      now: new Date("2026-06-26T12:00:00.000Z"),
      user: {
        avatarUrl: null,
        displayName: "CodeX",
        id: "user_123",
        locale: "tr",
        status: "online",
        username: "codex",
      },
    });
    const serialized = JSON.stringify(payload);

    assert.equal(payload.app.name, "Whispr");
    assert.equal(payload.app.serverTime, "2026-06-26T12:00:00.000Z");
    // The uploader takes a Bearer token and accepts the voice `audio/mp4` type,
    // so advertising this as pending was a lie that also disabled the mic.
    assert.equal(payload.features.attachments.status, "available");
    assert.equal(payload.features.invites.status, "available");
    assert.equal(payload.features.messageSearch.status, "available");
    assert.equal(payload.features.messages.status, "available");
    assert.equal(payload.features.pushNotifications.status, "requires-native-permission");
    assert.equal(payload.features.nativeAuthTokenExchange.status, "available");
    assert.equal(payload.home.servers.totalCount, 0);
    assert.equal(payload.home.directMessages.unreadCount, 0);
    assert.equal(serialized.includes("email"), false);
    assert.equal(serialized.includes("access_token"), false);
    assert.equal(serialized.includes("refresh_token"), false);
    assert.equal(serialized.includes("message content"), false);
  });

  it("accepts bounded real home summaries without message body content", () => {
    const payload = getMobileBootstrapPayload({
      home: {
        directMessages: {
          recent: [
            {
              avatarPair: [],
              iconUrl: null,
              id: "conversation_1",
              lastMessageAt: "2026-06-26T11:00:00.000Z",
              mentionCount: 0,
              muted: false,
              name: null,
              notifyLevel: "ALL" as const,
              overflowCount: 0,
              participantCount: 2,
              pinnedAt: null,
              participants: [
                {
                  avatarUrl: null,
                  displayName: "CodeX",
                  id: "user_123",
                  isBot: true,
                  status: "online",
                  username: "codex",
                },
              ],
              type: "DM",
              unreadCount: 2,
            },
          ],
          totalCount: 1,
          unreadCount: 2,
        },
        servers: {
          recent: [
            {
              channelCount: 3,
              iconUrl: null,
              id: "server_1",
              inviteAddress: "whispr.gg/whispr-uat",
              joinedAt: "2026-06-25T10:00:00.000Z",
              memberCount: 12,
              mentionCount: 1,
              muted: false,
              name: "Whispr UAT",
              notificationLevel: "all",
              shortName: "WU",
              starred: true,
              unreadCount: 2,
            },
          ],
          totalCount: 1,
        },
      },
      now: new Date("2026-06-26T12:00:00.000Z"),
      user: {
        avatarUrl: null,
        displayName: "CodeX",
        id: "user_123",
        locale: "tr",
        status: "online",
        username: "codex",
      },
    });

    const serialized = JSON.stringify(payload);

    assert.equal(payload.home.servers.totalCount, 1);
    assert.equal(payload.home.directMessages.totalCount, 1);
    assert.equal(payload.home.directMessages.recent[0]?.unreadCount, 2);
    assert.equal(serialized.includes("content"), false);
    // A0.3: 6c reads all four off the rail summary, so the payload builder must
    // carry them rather than drop them on the way through the schema.
    assert.equal(payload.home.servers.recent[0]?.starred, true);
    assert.equal(payload.home.servers.recent[0]?.muted, false);
    assert.equal(payload.home.servers.recent[0]?.notificationLevel, "all");
    assert.equal(payload.home.servers.recent[0]?.inviteAddress, "whispr.gg/whispr-uat");
  });

  it("accepts a fuller bounded mobile server rail without changing payload shape", () => {
    const payload = getMobileBootstrapPayload({
      home: {
        directMessages: {
          recent: [],
          totalCount: 0,
          unreadCount: 0,
        },
        servers: {
          recent: Array.from({ length: 12 }, (_, index) => ({
            channelCount: index + 1,
            iconUrl: null,
            id: `server_${index + 1}`,
            inviteAddress: null,
            joinedAt: "2026-06-25T10:00:00.000Z",
            memberCount: 10 + index,
            mentionCount: index,
            muted: false,
            name: `Whispr ${index + 1}`,
            notificationLevel: "all" as const,
            shortName: `W${index + 1}`,
            starred: false,
            unreadCount: index + 1,
          })),
          totalCount: 12,
        },
      },
      now: new Date("2026-06-26T12:00:00.000Z"),
      user: {
        avatarUrl: null,
        displayName: "CodeX",
        id: "user_123",
        locale: "tr",
        status: "online",
        username: "codex",
      },
    });

    assert.equal(payload.home.servers.recent.length, 12);
    assert.equal(payload.home.servers.totalCount, 12);
  });
});
