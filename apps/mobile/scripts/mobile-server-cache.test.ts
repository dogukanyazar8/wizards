import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
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
  patchMobileServerUserSettingsCaches,
} from "../src/query/mobile-server-cache";
import { runMobileServerUserSettingsUpdate } from "../src/query/mobile-server-user-settings";

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

const testQueryClients = new Set<QueryClient>();

function createMobileTestQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  testQueryClients.add(queryClient);
  return queryClient;
}

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
            inviteAddress: null,
            joinedAt: "2026-07-13T12:00:00.000Z",
            memberCount: 1,
            mentionCount: 0,
            muted: false,
            name: "First",
            notificationLevel: "all",
            shortName: "F",
            starred: false,
            unreadCount: 0,
          },
          {
            channelCount: 1,
            iconUrl: "https://cdn.example.test/old-server-2.png",
            id: "server-2",
            inviteAddress: null,
            joinedAt: "2026-07-13T12:00:00.000Z",
            memberCount: 1,
            mentionCount: 0,
            muted: false,
            name: "Second",
            notificationLevel: "all",
            shortName: "S",
            starred: false,
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
  afterEach(() => {
    for (const queryClient of testQueryClients) {
      queryClient.clear();
    }
    testQueryClients.clear();
  });

  it("uses test query defaults that do not leave a cache GC timer", () => {
    const queryClient = createMobileTestQueryClient();
    const queryKey = ["mobile", "test-query-client"] as const;
    queryClient.setQueryData(queryKey, { ready: true });

    const query = queryClient.getQueryCache().find({ queryKey });

    assert.equal(query?.options.gcTime, Infinity);
  });

  it("patches only the matching bootstrap and managed workspace server while preserving capabilities", () => {
    const queryClient = createMobileTestQueryClient();
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
    const queryClient = createMobileTestQueryClient();
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
    const queryClient = createMobileTestQueryClient();
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
    const queryClient = createMobileTestQueryClient();
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
    const queryClient = createMobileTestQueryClient();
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

describe("mobile server user settings cache", () => {
  afterEach(() => {
    for (const queryClient of testQueryClients) {
      queryClient.clear();
    }
    testQueryClients.clear();
  });

  function createProfile(serverId: string) {
    return {
      muted: false,
      notificationLevel: "all" as const,
      serverId,
      starred: false,
    };
  }

  // 6c writes one endpoint and two caches: the rail summary the sheet reads its
  // toggles from, and the profile read model 6d/6e render.
  it("writes the patch into the bootstrap summary and the profile read model", () => {
    const queryClient = createMobileTestQueryClient();
    const bootstrap = createBootstrap();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);
    queryClient.setQueryData(
      mobileQueryKeys.aboutServerProfile("server-1"),
      createProfile("server-1"),
    );

    patchMobileServerUserSettingsCaches({
      queryClient,
      serverId: "server-1",
      settings: { notificationLevel: "mentions", starred: true },
    });

    const nextBootstrap = queryClient.getQueryData<MobileBootstrapPayload>(
      mobileQueryKeys.bootstrap(),
    );

    assert.equal(nextBootstrap?.home.servers.recent[0]?.starred, true);
    assert.equal(nextBootstrap?.home.servers.recent[0]?.notificationLevel, "mentions");
    // The patch carried neither, so neither moved: "sessize al" and "bildirim
    // ayarları" are separate concepts and one must not reset the other.
    assert.equal(nextBootstrap?.home.servers.recent[0]?.muted, false);
    assert.equal(nextBootstrap?.home.servers.recent[1], bootstrap.home.servers.recent[1]);

    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.aboutServerProfile("server-1")), {
      muted: false,
      notificationLevel: "mentions",
      serverId: "server-1",
      starred: true,
    });
  });

  it("leaves an untouched server and an absent profile entry alone", () => {
    const queryClient = createMobileTestQueryClient();
    const bootstrap = createBootstrap();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);

    patchMobileServerUserSettingsCaches({
      queryClient,
      serverId: "server-2",
      settings: { muted: true },
    });

    const nextBootstrap = queryClient.getQueryData<MobileBootstrapPayload>(
      mobileQueryKeys.bootstrap(),
    );

    assert.equal(nextBootstrap?.home.servers.recent[0], bootstrap.home.servers.recent[0]);
    assert.equal(nextBootstrap?.home.servers.recent[1]?.muted, true);
    assert.equal(
      queryClient.getQueryData(mobileQueryKeys.aboutServerProfile("server-2")),
      undefined,
    );
  });

  it("returns the same bootstrap object when nothing actually changes", () => {
    const queryClient = createMobileTestQueryClient();
    const bootstrap = createBootstrap();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), bootstrap);

    patchMobileServerUserSettingsCaches({
      queryClient,
      serverId: "server-1",
      settings: { starred: false },
    });

    assert.equal(queryClient.getQueryData(mobileQueryKeys.bootstrap()), bootstrap);
  });
});

describe("runMobileServerUserSettingsUpdate", () => {
  afterEach(() => {
    for (const queryClient of testQueryClients) {
      queryClient.clear();
    }
    testQueryClients.clear();
  });

  function settingsClient(respond: (body: unknown) => Promise<unknown>): {
    client: MobileApiClient;
    bodies: unknown[];
  } {
    const bodies: unknown[] = [];
    return {
      bodies,
      client: {
        requestJson: (_path: string, init?: { body?: unknown }) => {
          bodies.push(init?.body);
          return respond(init?.body);
        },
      } as unknown as MobileApiClient,
    };
  }

  function respondWith(settings: {
    muted: boolean;
    notificationLevel: "all" | "mentions" | "none";
    starred: boolean;
  }) {
    return Promise.resolve({ settings: { ...settings, mutedUntil: null } });
  }

  it("paints the toggle before the request and publishes what the server answered", async () => {
    const queryClient = createMobileTestQueryClient();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), createBootstrap());
    const { bodies, client } = settingsClient(() =>
      respondWith({ muted: false, notificationLevel: "all", starred: true }),
    );

    const pending = runMobileServerUserSettingsUpdate({
      client,
      inFlight: new Set<string>(),
      onError: () => assert.fail("a successful write must not report an error"),
      queryClient,
      serverId: "server-1",
      settings: { starred: true },
    });

    // Optimistic: the star is already on while the request is still open.
    assert.equal(
      queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap())?.home.servers
        .recent[0]?.starred,
      true,
    );

    await pending;

    assert.deepEqual(bodies, [{ starred: true }]);
    assert.equal(
      queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap())?.home.servers
        .recent[0]?.starred,
      true,
    );
  });

  // Acceptance 3: a double tap is one request, not two racing ones.
  it("drops a second press for the same preference while the first is in flight", async () => {
    const queryClient = createMobileTestQueryClient();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), createBootstrap());
    const inFlight = new Set<string>();
    const { bodies, client } = settingsClient(() =>
      respondWith({ muted: true, notificationLevel: "all", starred: false }),
    );

    const first = runMobileServerUserSettingsUpdate({
      client,
      inFlight,
      onError: () => undefined,
      queryClient,
      serverId: "server-1",
      settings: { muted: true },
    });
    await runMobileServerUserSettingsUpdate({
      client,
      inFlight,
      onError: () => undefined,
      queryClient,
      serverId: "server-1",
      settings: { muted: false },
    });
    await first;

    assert.deepEqual(bodies, [{ muted: true }]);
    // The guard is per preference, so the star is still free to move.
    await runMobileServerUserSettingsUpdate({
      client,
      inFlight,
      onError: () => undefined,
      queryClient,
      serverId: "server-1",
      settings: { starred: true },
    });
    assert.equal(bodies.length, 2);
  });

  it("rolls the optimistic write back and reports the failure", async () => {
    const queryClient = createMobileTestQueryClient();
    queryClient.setQueryData(mobileQueryKeys.bootstrap(), createBootstrap());
    queryClient.setQueryData(mobileQueryKeys.aboutServerProfile("server-1"), {
      muted: false,
      notificationLevel: "all",
      serverId: "server-1",
      starred: false,
    });
    let errors = 0;
    const { client } = settingsClient(() => Promise.reject(new Error("offline")));

    await runMobileServerUserSettingsUpdate({
      client,
      inFlight: new Set<string>(),
      onError: () => {
        errors += 1;
      },
      queryClient,
      serverId: "server-1",
      settings: { notificationLevel: "none" },
    });

    assert.equal(errors, 1);
    assert.equal(
      queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap())?.home.servers
        .recent[0]?.notificationLevel,
      "all",
    );
    assert.deepEqual(queryClient.getQueryData(mobileQueryKeys.aboutServerProfile("server-1")), {
      muted: false,
      notificationLevel: "all",
      serverId: "server-1",
      starred: false,
    });
  });
});
