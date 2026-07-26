import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  MobileBootstrapPayload,
  MobileFriendsOverviewResponse,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";
import {
  patchMobileRealtimeBootstrapProfile,
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
    displayName: "Ada",
    id: "user-1",
    lastSeenAt: null,
    presence: { customStatus: null, status: "ONLINE" as const },
    status: "ONLINE" as const,
    username: "ada",
  };
  const unaffected = {
    avatarUrl: null,
    customStatus: "Busy",
    displayName: "Grace",
    id: "user-2",
    lastSeenAt: null,
    presence: { customStatus: "Busy", status: "DND" as const },
    status: "DND" as const,
    username: "grace",
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
