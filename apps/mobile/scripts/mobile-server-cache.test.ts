import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../src/api/mobile-api-client";
import { mobileQueryKeys } from "../src/query/mobile-query-keys";
import { getMobileWorkspaceQueryOptions } from "../src/query/mobile-workspace-query";
import {
  confirmMobileServerIconPersisted,
  patchMobileServerIconCaches,
} from "../src/query/mobile-server-cache";

const capabilities = {
  canClearHistory: false,
  canDeleteServer: false,
  canKickMembers: false,
  canManageChannels: false,
  canManageInvites: false,
  canManageMessages: false,
  canManageRoles: false,
  canManageServer: true,
  canUploadServerIcon: true,
};

function createBootstrap(): MobileBootstrapPayload {
  return {
    app: {
      buildId: "build-1",
      name: "Whispr",
      releaseChannel: "uat",
      serverTime: "2026-07-13T12:00:00.000Z",
      version: "0.8.15",
    },
    contracts: { deepLinks: ["route"], permissions: ["photoLibrary"] },
    features: {
      attachments: { label: "Attachments", status: "available" },
      invites: { label: "Invites", status: "available" },
      messageSearch: { label: "Search", status: "available" },
      messages: { label: "Messages", status: "available" },
      nativeAuthTokenExchange: { label: "Auth", status: "available" },
      pushNotifications: { label: "Push", status: "available" },
      voice: { label: "Voice", status: "available" },
    },
    flags: {},
    isAdmin: false,
    home: {
      directMessages: { recent: [], totalCount: 0, unreadCount: 0 },
      servers: {
        recent: [
          {
            channelCount: 1,
            iconUrl: "https://cdn.example.test/old-server-1.png",
            id: "server-1",
            joinedAt: "2026-07-13T12:00:00.000Z",
            memberCount: 1,
            mentionCount: 0,
            name: "First",
            shortName: "F",
            unreadCount: 0,
          },
          {
            channelCount: 1,
            iconUrl: "https://cdn.example.test/old-server-2.png",
            id: "server-2",
            joinedAt: "2026-07-13T12:00:00.000Z",
            memberCount: 1,
            mentionCount: 0,
            name: "Second",
            shortName: "S",
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
      displayName: "Alice",
      id: "user-1",
      locale: "en",
      status: "ONLINE",
      username: "alice",
    },
  };
}

function createWorkspace(serverId: string): MobileManagedWorkspaceServerDetailResponse {
  return {
    detail: {
      capabilities,
      categories: [],
      hasMoreChannels: false,
      members: [],
      server: {
        allowFileUploads: true,
        allowGifs: true,
        defaultChannelId: null,
        description: null,
        iconUrl: `https://cdn.example.test/old-${serverId}.png`,
        id: serverId,
        memberCount: 1,
        mentionCount: 0,
        name: serverId,
        onlineMemberCount: 1,
        ownerUserId: null,
        shortName: null,
        unreadCount: 0,
        visibleChannelCount: 1,
      },
      ungroupedChannels: [],
    },
  };
}

describe("mobile server icon cache", () => {
  it("patches only the matching bootstrap and managed workspace server while preserving capabilities", () => {
    const queryClient = new QueryClient();
    const bootstrap = createBootstrap();
    const firstWorkspace = createWorkspace("server-1");
    const secondWorkspace = createWorkspace("server-2");
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);
    queryClient.setQueryData(mobileQueryKeys.workspace("server-1"), firstWorkspace);
    queryClient.setQueryData(mobileQueryKeys.workspace("server-2"), secondWorkspace);

    patchMobileServerIconCaches({
      iconUrl: "https://cdn.example.test/server-1-new.png",
      queryClient,
      serverId: "server-1",
    });

    const nextBootstrap = queryClient.getQueryData<MobileBootstrapPayload>(
      mobileQueryKeys.bootstrap(),
    );
    const nextFirst = queryClient.getQueryData<MobileManagedWorkspaceServerDetailResponse>(
      mobileQueryKeys.workspace("server-1"),
    );
    const nextSecond = queryClient.getQueryData<MobileManagedWorkspaceServerDetailResponse>(
      mobileQueryKeys.workspace("server-2"),
    );

    assert.equal(
      nextBootstrap?.home.servers.recent[0]?.iconUrl,
      "https://cdn.example.test/server-1-new.png",
    );
    assert.equal(nextBootstrap?.home.servers.recent[1], bootstrap.home.servers.recent[1]);
    assert.equal(nextFirst?.detail.server.iconUrl, "https://cdn.example.test/server-1-new.png");
    assert.equal(nextFirst?.detail.capabilities, firstWorkspace.detail.capabilities);
    assert.equal(nextSecond, secondWorkspace);
  });

  it("confirms the icon only when the API read-back returns the claimed url", async () => {
    const queryClient = new QueryClient();
    const claimedIconUrl = "https://cdn.example.test/server-1-new.png";
    const workspace = createWorkspace("server-1");
    // Optimistically patched cache: a staleTime-respecting read would confirm itself.
    queryClient.setQueryData(mobileQueryKeys.workspace("server-1"), {
      ...workspace,
      detail: {
        ...workspace.detail,
        server: { ...workspace.detail.server, iconUrl: claimedIconUrl },
      },
    });

    const requestedPaths: string[] = [];
    const client = {
      requestJson: async (path: string) => {
        requestedPaths.push(path);
        return workspace;
      },
    } as unknown as MobileApiClient;

    assert.equal(
      await confirmMobileServerIconPersisted({
        client,
        iconUrl: claimedIconUrl,
        queryClient,
        serverId: "server-1",
      }),
      false,
    );
    assert.equal(requestedPaths.length, 1);
  });

  it("confirms the icon while a stale workspace refetch is still in flight", async () => {
    const queryClient = new QueryClient();
    const claimedIconUrl = "https://cdn.example.test/server-1-new.png";
    const staleWorkspace = createWorkspace("server-1");
    const claimedWorkspace = {
      ...staleWorkspace,
      detail: {
        ...staleWorkspace.detail,
        server: { ...staleWorkspace.detail.server, iconUrl: claimedIconUrl },
      },
    };

    // Returning from the OS image picker refocuses the app, so TanStack starts a
    // workspace refetch that left the device before the claim committed. It is still
    // in flight when the upload finishes and it still carries the previous icon.
    const staleRefetchClient = {
      requestJson: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return staleWorkspace;
      },
    } as unknown as MobileApiClient;
    const staleRefetch = queryClient.fetchQuery({
      ...getMobileWorkspaceQueryOptions(staleRefetchClient, "server-1"),
      staleTime: 0,
    });

    patchMobileServerIconCaches({ iconUrl: claimedIconUrl, queryClient, serverId: "server-1" });

    const requestedPaths: string[] = [];
    const client = {
      requestJson: async (path: string) => {
        requestedPaths.push(path);
        return claimedWorkspace;
      },
    } as unknown as MobileApiClient;

    const confirmed = await confirmMobileServerIconPersisted({
      client,
      iconUrl: claimedIconUrl,
      queryClient,
      serverId: "server-1",
    });

    await staleRefetch;

    assert.equal(confirmed, true);
    assert.equal(requestedPaths.length, 1);
  });

  it("reports an unconfirmed icon when the read-back fails", async () => {
    const queryClient = new QueryClient();
    const client = {
      requestJson: async () => {
        throw new Error("offline");
      },
    } as unknown as MobileApiClient;

    assert.equal(
      await confirmMobileServerIconPersisted({
        client,
        iconUrl: "https://cdn.example.test/server-1-new.png",
        queryClient,
        serverId: "server-1",
      }),
      false,
    );
  });

  it("fails closed for a non-HTTPS icon URL", () => {
    const queryClient = new QueryClient();
    const bootstrap = createBootstrap();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);

    patchMobileServerIconCaches({
      iconUrl: "file:///private-server-icon.png",
      queryClient,
      serverId: "server-1",
    });

    assert.equal(queryClient.getQueryData(mobileQueryKeys.bootstrap()), bootstrap);
  });
});
