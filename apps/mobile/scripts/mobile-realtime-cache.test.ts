import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InfiniteData } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileDMConversationsResponse,
  MobileFriendsOverviewResponse,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";
import {
  patchMobileRealtimeBootstrapProfile,
  patchMobileRealtimeDMConversationReceipt,
  patchMobileRealtimeFriendsVoiceRoom,
  patchMobileRealtimeBootstrapPresence,
  patchMobileRealtimeBootstrapServerUnread,
  patchMobileRealtimeFriendsProfile,
  patchMobileRealtimeFriendsPresence,
  patchMobileRealtimeWorkspaceProfile,
  patchMobileRealtimeWorkspacePresence,
  patchMobileRealtimeWorkspaceServerUnread,
  removeMobileRealtimeBootstrapServer,
} from "../src/query/mobile-realtime-cache";

function makeBootstrap(): MobileBootstrapPayload {
  const feature = { label: "Ready", status: "available" as const };

  return {
    app: {
      buildId: "uat",
      name: "Whispr",
      releaseChannel: "uat",
      serverTime: "2026-07-13T12:00:00.000Z",
      version: "0.8.15",
    },
    contracts: { deepLinks: ["route"], permissions: ["notifications"] },
    features: {
      attachments: feature,
      invites: feature,
      messageSearch: feature,
      messages: feature,
      nativeAuthTokenExchange: feature,
      pushNotifications: feature,
      voice: feature,
    },
    flags: {},
    isAdmin: false,
    home: {
      directMessages: { recent: [], totalCount: 0, unreadCount: 0 },
      servers: {
        recent: [
          {
            channelCount: 2,
            iconUrl: null,
            id: "server-1",
            joinedAt: "2026-07-13T10:00:00.000Z",
            memberCount: 2,
            mentionCount: 0,
            name: "Primary",
            shortName: null,
            unreadCount: 0,
          },
          {
            channelCount: 1,
            iconUrl: null,
            id: "server-2",
            joinedAt: "2026-07-13T10:00:00.000Z",
            memberCount: 2,
            mentionCount: 0,
            name: "Unaffected",
            shortName: null,
            unreadCount: 0,
          },
        ],
        totalCount: 2,
      },
    },
    user: {
      avatarUrl: null,
      bannerColor: null,
      bannerOffsetX: null,
      bannerOffsetY: null,
      bannerUrl: null,
      displayName: "Ada",
      id: "user-1",
      locale: "en",
      status: "ONLINE",
      username: "ada",
    },
  };
}

function makeFriends(): MobileFriendsOverviewResponse {
  const target = {
    avatarUrl: null,
    customStatus: null,
    device: null,
    displayName: "Ada",
    id: "user-1",
    lastSeenAt: null,
    presence: { customStatus: null, status: "ONLINE" as const },
    status: "ONLINE" as const,
    username: "ada",
    voiceRoom: null,
  };
  const unaffected = {
    avatarUrl: null,
    customStatus: "Busy",
    device: null,
    displayName: "Grace",
    id: "user-2",
    lastSeenAt: null,
    presence: { customStatus: "Busy", status: "DND" as const },
    status: "DND" as const,
    username: "grace",
    voiceRoom: null,
  };

  return {
    blocked: [
      {
        avatarUrl: null,
        displayName: "Ada",
        id: "user-1",
        username: "ada",
      },
    ],
    friends: [target, unaffected],
    pending: {
      incoming: [
        {
          createdAt: "2026-07-13T09:00:00.000Z",
          id: "request-1",
          mutualFriendCount: 0,
          mutualServerCount: 0,
          mutualServerName: null,
          receiver: {
            avatarUrl: null,
            displayName: "Grace",
            id: "user-2",
            username: "grace",
          },
          receiverId: "user-2",
          sender: {
            avatarUrl: null,
            displayName: "Ada",
            id: "user-1",
            username: "ada",
          },
          senderId: "user-1",
          status: "PENDING",
          updatedAt: "2026-07-13T09:00:00.000Z",
          viaUsername: null,
        },
      ],
      outgoing: [],
    },
  };
}

function makeWorkspace(): MobileManagedWorkspaceServerDetailResponse {
  return {
    detail: {
      capabilities: {
        canClearHistory: true,
        canDeleteServer: false,
        canKickMembers: true,
        canManageChannels: false,
        canManageInvites: true,
        canManageMessages: true,
        canManageRoles: false,
        canManageServer: false,
        canUploadServerIcon: true,
      },
      categories: [],
      hasMoreChannels: false,
      members: [
        {
          accessLevel: "MEMBER",
          avatarUrl: null,
          customStatus: null,
          displayName: "Ada",
          id: "membership-1",
          roles: [],
          status: "ONLINE",
          userId: "user-1",
          username: "ada",
        },
        {
          accessLevel: "MEMBER",
          avatarUrl: null,
          customStatus: "Busy",
          displayName: "Grace",
          id: "membership-2",
          roles: [],
          status: "DND",
          userId: "user-2",
          username: "grace",
        },
      ],
      server: {
        allowFileUploads: true,
        allowGifs: true,
        defaultChannelId: null,
        description: null,
        iconUrl: null,
        id: "server-1",
        memberCount: 2,
        mentionCount: 0,
        name: "Primary",
        onlineMemberCount: 1,
        ownerUserId: null,
        shortName: null,
        unreadCount: 0,
        visibleChannelCount: 0,
      },
      ungroupedChannels: [],
    },
  };
}

describe("mobile realtime cache", () => {
  it("removes only the departed server from bootstrap while preserving unrelated references", () => {
    const bootstrap = makeBootstrap();
    const result = removeMobileRealtimeBootstrapServer(bootstrap, "server-1");

    assert.equal(result.patched, true);
    assert.deepEqual(
      result.data?.home.servers.recent.map((server) => server.id),
      ["server-2"],
    );
    assert.equal(result.data?.home.servers.totalCount, 1);
    assert.equal(result.data?.home.directMessages, bootstrap.home.directMessages);
    assert.equal(result.data?.home.servers.recent[0], bootstrap.home.servers.recent[1]);
    assert.equal(removeMobileRealtimeBootstrapServer(bootstrap, "server-404").data, bootstrap);
  });

  it("patches only matching friend and workspace presence identities", () => {
    const friends = makeFriends();
    const workspace = makeWorkspace();
    const presence = { customStatus: "Reviewing", status: "IDLE" as const, userId: "user-1" };

    const friendResult = patchMobileRealtimeFriendsPresence(friends, presence);
    const workspaceResult = patchMobileRealtimeWorkspacePresence(workspace, presence);

    assert.equal(friendResult.patched, true);
    assert.equal(friendResult.data?.friends[0]?.status, "IDLE");
    assert.equal(friendResult.data?.friends[0]?.presence.customStatus, "Reviewing");
    assert.equal(friendResult.data?.friends[1], friends.friends[1]);
    assert.equal(workspaceResult.patched, true);
    assert.equal(workspaceResult.data?.detail.members[0]?.status, "IDLE");
    assert.equal(workspaceResult.data?.detail.members[1], workspace.detail.members[1]);
    assert.equal(workspaceResult.data?.detail.capabilities, workspace.detail.capabilities);
    assert.equal(patchMobileRealtimeBootstrapPresence(makeBootstrap(), presence).patched, true);
  });

  it("patches matching profile identities without dropping management capabilities", () => {
    const bootstrap = makeBootstrap();
    const friends = makeFriends();
    const workspace = makeWorkspace();
    const profile = {
      avatarUrl: "https://cdn.example.com/ada.png",
      customStatus: "Shipping",
      displayName: "Ada Lovelace",
      status: "DND" as const,
      userId: "user-1",
      username: "ada-lovelace",
    };

    const bootstrapResult = patchMobileRealtimeBootstrapProfile(bootstrap, profile);
    const friendsResult = patchMobileRealtimeFriendsProfile(friends, profile);
    const workspaceResult = patchMobileRealtimeWorkspaceProfile(workspace, profile);

    assert.equal(bootstrapResult.data?.user.username, "ada-lovelace");
    assert.equal(friendsResult.data?.friends[0]?.avatarUrl, profile.avatarUrl);
    assert.equal(friendsResult.data?.blocked[0]?.displayName, profile.displayName);
    assert.equal(friendsResult.data?.pending.incoming[0]?.sender.username, profile.username);
    assert.equal(friendsResult.data?.friends[1], friends.friends[1]);
    assert.equal(workspaceResult.data?.detail.members[0]?.displayName, profile.displayName);
    assert.equal(workspaceResult.data?.detail.members[1], workspace.detail.members[1]);
    assert.equal(workspaceResult.data?.detail.capabilities, workspace.detail.capabilities);
  });

  it("patches only the matching server unread and mention counts", () => {
    const bootstrap = makeBootstrap();
    const workspace = makeWorkspace();
    const event = { mentionCount: 2, serverId: "server-1", unreadCount: 5 };

    const bootstrapResult = patchMobileRealtimeBootstrapServerUnread(bootstrap, event);
    const workspaceResult = patchMobileRealtimeWorkspaceServerUnread(workspace, event);

    assert.equal(bootstrapResult.patched, true);
    assert.equal(bootstrapResult.data?.home.servers.recent[0]?.unreadCount, 5);
    assert.equal(bootstrapResult.data?.home.servers.recent[1], bootstrap.home.servers.recent[1]);
    assert.equal(workspaceResult.patched, true);
    assert.equal(workspaceResult.data?.detail.server.mentionCount, 2);
    assert.equal(
      patchMobileRealtimeWorkspaceServerUnread(workspace, {
        mentionCount: 2,
        serverId: "server-404",
        unreadCount: 5,
      }).data,
      workspace,
    );
  });

  it("keeps unavailable and unrelated cache entries unchanged", () => {
    const presence = { customStatus: null, status: "OFFLINE" as const, userId: "user-404" };
    const profile = {
      avatarUrl: null,
      customStatus: null,
      displayName: null,
      status: "OFFLINE" as const,
      userId: "user-404",
      username: "unknown",
    };
    const bootstrap = makeBootstrap();
    const friends = makeFriends();
    const workspace = makeWorkspace();

    assert.equal(patchMobileRealtimeBootstrapPresence(undefined, presence).patched, false);
    assert.equal(patchMobileRealtimeBootstrapProfile(bootstrap, profile).data, bootstrap);
    assert.equal(patchMobileRealtimeFriendsPresence(friends, presence).data, friends);
    assert.equal(patchMobileRealtimeFriendsProfile(friends, profile).data, friends);
    assert.equal(patchMobileRealtimeWorkspacePresence(workspace, presence).data, workspace);
    assert.equal(patchMobileRealtimeWorkspaceProfile(workspace, profile).data, workspace);
  });
});

const VOICE_ROOM = {
  channelId: "channel-1",
  channelName: "live-room",
  serverId: "server-1",
  serverName: "paycore",
};

function makeDMConversations(
  deliveryStatus: "sent" | "delivered" | "read" | null,
): InfiniteData<MobileDMConversationsResponse, unknown> {
  return {
    pageParams: [null],
    pages: [
      {
        conversations: [
          {
            iconUrl: null,
            id: "dm-1",
            lastMessage: {
              author: { displayName: "Dogukan", id: "user-1", username: "dogukan" },
              authorIsCurrentUser: deliveryStatus !== null,
              createdAt: "2026-07-28T08:00:00.000Z",
              deliveryStatus,
              durationSec: null,
              id: "message-1",
              kind: "text" as const,
              text: "Merhaba",
            },
            lastMessageAt: "2026-07-28T08:00:00.000Z",
            mentionCount: 0,
            muted: false,
            name: null,
            participantCount: 2,
            participants: [],
            type: "DM" as const,
            unreadCount: 0,
          },
        ],
        nextCursor: null,
        totalUnreadCount: 0,
      },
    ],
  };
}

describe("1a voice-room and receipt cache patches", () => {
  it("swaps the presence dot for the wave tile and back without a refetch", () => {
    const joined = patchMobileRealtimeFriendsVoiceRoom(makeFriends(), {
      userId: "user-1",
      voiceRoom: VOICE_ROOM,
    });
    assert.equal(joined.patched, true);
    assert.deepEqual(joined.data?.friends[0]?.voiceRoom, VOICE_ROOM);
    // The other friend is untouched.
    assert.equal(joined.data?.friends[1]?.voiceRoom, null);

    const left = patchMobileRealtimeFriendsVoiceRoom(joined.data, {
      userId: "user-1",
      voiceRoom: null,
    });
    assert.equal(left.patched, true);
    assert.equal(left.data?.friends[0]?.voiceRoom, null);
  });

  it("ignores a voice update that changes nothing or names a stranger", () => {
    const friends = makeFriends();

    assert.equal(
      patchMobileRealtimeFriendsVoiceRoom(friends, { userId: "user-1", voiceRoom: null }).patched,
      false,
    );
    assert.equal(
      patchMobileRealtimeFriendsVoiceRoom(friends, { userId: "user-404", voiceRoom: VOICE_ROOM })
        .patched,
      false,
    );
    assert.equal(
      patchMobileRealtimeFriendsVoiceRoom(undefined, { userId: "user-1", voiceRoom: VOICE_ROOM })
        .patched,
      false,
    );
  });

  it("walks the outgoing preview from sent to delivered to read", () => {
    const delivered = patchMobileRealtimeDMConversationReceipt(makeDMConversations("sent"), {
      at: "2026-07-28T08:00:30.000Z",
      conversationId: "dm-1",
      kind: "delivered",
      userId: "user-2",
    });
    assert.equal(delivered.patched, true);
    assert.equal(
      delivered.data?.pages[0]?.conversations[0]?.lastMessage?.deliveryStatus,
      "delivered",
    );

    const read = patchMobileRealtimeDMConversationReceipt(delivered.data, {
      at: "2026-07-28T08:01:00.000Z",
      conversationId: "dm-1",
      kind: "read",
      userId: "user-2",
    });
    assert.equal(read.data?.pages[0]?.conversations[0]?.lastMessage?.deliveryStatus, "read");

    // A delivery mark arriving after the read one must not walk it backwards.
    const late = patchMobileRealtimeDMConversationReceipt(read.data, {
      at: "2026-07-28T08:02:00.000Z",
      conversationId: "dm-1",
      kind: "delivered",
      userId: "user-2",
    });
    assert.equal(late.patched, false);
  });

  it("refuses receipts that are the author's own, stale, or for an incoming preview", () => {
    const sent = makeDMConversations("sent");

    // The author reading their own conversation says nothing about the peer.
    assert.equal(
      patchMobileRealtimeDMConversationReceipt(sent, {
        at: "2026-07-28T08:05:00.000Z",
        conversationId: "dm-1",
        kind: "read",
        userId: "user-1",
      }).patched,
      false,
    );

    // A receipt older than the message describes an earlier one.
    assert.equal(
      patchMobileRealtimeDMConversationReceipt(sent, {
        at: "2026-07-28T07:59:00.000Z",
        conversationId: "dm-1",
        kind: "read",
        userId: "user-2",
      }).patched,
      false,
    );

    // An incoming preview has no tick to move.
    assert.equal(
      patchMobileRealtimeDMConversationReceipt(makeDMConversations(null), {
        at: "2026-07-28T08:05:00.000Z",
        conversationId: "dm-1",
        kind: "read",
        userId: "user-2",
      }).patched,
      false,
    );
  });
});
