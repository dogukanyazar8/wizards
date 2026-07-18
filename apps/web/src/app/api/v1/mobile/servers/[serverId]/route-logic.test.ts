import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MobileServerCapabilities, WorkspaceServerDetail } from "@wizards/types";

import { ApiError, parseJsonBody } from "@/lib/api";
import type { AccessContext } from "@/lib/workspace/workspace-types";

const routes = import("./route-logic");

const access = {
  accessLevel: "MEMBER",
  memberId: "member-1",
  ownerId: "owner-1",
  roles: [],
  serverId: "server-1",
  serverName: "Guild",
  userId: "user-1",
} satisfies AccessContext;

const capabilities = {
  canClearHistory: false,
  canDeleteServer: false,
  canKickMembers: false,
  canManageChannels: false,
  canManageInvites: false,
  canManageRoles: false,
  canManageServer: false,
  canUploadServerIcon: false,
} satisfies MobileServerCapabilities;

const detail = {
  categories: [],
  invites: [],
  memberPage: { limit: 80, nextCursor: null },
  members: [],
  roles: [],
  server: {
    accessLevel: "MEMBER",
    allowFileUploads: true,
    allowGifs: true,
    allowMemberAdds: true,
    defaultChannelId: "channel-1",
    deletedMessageNoticeMinutes: 60,
    description: "A guild",
    iconUrl: "https://cdn.whispr.test/icon.png",
    id: "server-1",
    inviteCode: null,
    isAdmin: true,
    isOwner: false,
    memberCount: 2,
    mentionCount: 1,
    messageCharacterLimit: 2_000,
    name: "Guild",
    shortName: "GLD",
    unreadCount: 3,
  },
  ungroupedChannels: [
    {
      canAccess: true,
      categoryId: null,
      id: "channel-1",
      locked: false,
      mentionCount: 1,
      name: "general",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 3,
    },
  ],
} satisfies WorkspaceServerDetail;

const mobileProjection = {
  ...detail,
  server: { ...detail.server, onlineMemberCount: 1 },
};

const mobileDetail = {
  categories: [],
  hasMoreChannels: false,
  members: [],
  server: {
    allowFileUploads: true,
    allowGifs: true,
    defaultChannelId: "channel-1",
    description: "A guild",
    iconUrl: "https://cdn.whispr.test/icon.png",
    id: "server-1",
    memberCount: 2,
    mentionCount: 1,
    name: "Guild",
    shortName: "GLD",
    onlineMemberCount: 1,
    unreadCount: 3,
    visibleChannelCount: 1,
  },
  ungroupedChannels: [
    {
      categoryId: null,
      categoryName: null,
      id: "channel-1",
      lastMessage: null,
      locked: false,
      mentionCount: 1,
      name: "general",
      position: 0,
      readOnly: false,
      topic: null,
      type: "TEXT",
      unreadCount: 3,
    },
  ],
};

function request(method: "DELETE" | "GET" | "PATCH", body?: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method,
  });
}

function context(params: Record<string, string>, onRead: () => void = () => undefined) {
  return {
    get params() {
      onRead();
      return Promise.resolve(params);
    },
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    deleteServer: async () => undefined,
    enforceRateLimit: async () => undefined,
    getServerDetailWithAccess: async () => ({
      access,
      detail: mobileProjection,
      hasMoreChannels: false,
    }),
    parseBody: parseJsonBody,
    resolveCapabilities: () => capabilities,
    updateServer: async () => detail,
    ...overrides,
  };
}

describe("mobile server detail route logic", () => {
  it("GET authenticates, rate limits, validates params, loads access, and returns managed detail", async () => {
    const { mobileServerDetailRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerDetailRoute(
      request("GET"),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        getServerDetailWithAccess: async (userId: string, serverId: string) => {
          calls.push(`service:${userId}:${serverId}`);
          return { access, detail: mobileProjection };
        },
        resolveCapabilities: (receivedAccess: AccessContext) => {
          calls.push("capabilities");
          assert.strictEqual(receivedAccess, access);
          return capabilities;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      detail: { ...mobileDetail, capabilities },
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:detail",
      "params",
      "service:user-1:server-1",
      "capabilities",
    ]);
  });

  it("PATCH updates, reloads exact access, and returns strict managed detail", async () => {
    const { mobileServerUpdateRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerUpdateRoute(
      request("PATCH", { name: "  Guild  " }),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        getServerDetailWithAccess: async (userId: string, serverId: string) => {
          calls.push(`reload:${userId}:${serverId}`);
          return { access, detail: mobileProjection };
        },
        parseBody,
        resolveCapabilities: (receivedAccess: AccessContext) => {
          calls.push("capabilities");
          assert.strictEqual(receivedAccess, access);
          return capabilities;
        },
        updateServer: async (userId: string, serverId: string, input: { name?: string }) => {
          calls.push(`service:${userId}:${serverId}:${input.name}`);
          return detail;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      detail: { ...mobileDetail, capabilities },
    });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:update",
      "params",
      "body",
      "service:user-1:server-1:Guild",
      "reload:user-1:server-1",
      "capabilities",
    ]);
  });

  it("preserves the canonical last-message preview when the mobile projection provides one", async () => {
    const { mobileServerDetailRoute } = await routes;
    const previewDetail = {
      ...mobileProjection,
      ungroupedChannels: [
        {
          ...mobileProjection.ungroupedChannels[0]!,
          lastMessage: {
            author: { displayName: "Ada", id: "user-2", username: "ada" },
            createdAt: "2026-07-15T08:00:00.000Z",
            id: "message-1",
            text: "Canonical preview text",
          },
        },
      ],
    };
    const response = await mobileServerDetailRoute(
      request("GET"),
      context({ serverId: "server-1" }),
      dependencies({
        getServerDetailWithAccess: async () => ({ access, detail: previewDetail }),
      }),
    );

    const body = (await response.json()) as {
      detail: { ungroupedChannels: Array<{ lastMessage: { text: string } | null }> };
    };
    assert.equal(response.status, 200);
    assert.equal(body.detail.ungroupedChannels[0]?.lastMessage?.text, "Canonical preview text");
  });

  it("caps each category at 40 channels and treats the 41st row as a conservative sentinel", async () => {
    const { mobileServerDetailRoute } = await routes;

    for (const channelCount of [40, 41]) {
      const channels = Array.from({ length: channelCount }, (_, index) => ({
        canAccess: true,
        categoryId: "category-1",
        id: `channel-${index}`,
        locked: false,
        mentionCount: 0,
        name: `channel-${index}`,
        position: index,
        readOnly: false,
        topic: null,
        type: "TEXT" as const,
        unreadCount: 0,
      }));
      const boundedDetail = {
        ...mobileProjection,
        categories: [{ channels, id: "category-1", name: "Category", position: 0 }],
        server: {
          ...mobileProjection.server,
          defaultChannelId: `channel-${channelCount - 1}`,
        },
        ungroupedChannels: [],
      } satisfies WorkspaceServerDetail;

      const response = await mobileServerDetailRoute(
        request("GET"),
        context({ serverId: "server-1" }),
        dependencies({
          getServerDetailWithAccess: async () => ({
            access,
            detail: boundedDetail,
            hasMoreChannels: channelCount === 41,
          }),
        }),
      );
      const body = (await response.json()) as {
        detail: {
          categories: Array<{ channels: Array<{ id: string }> }>;
          hasMoreChannels: boolean;
          server: { defaultChannelId: string | null; visibleChannelCount: number };
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.detail.categories[0]?.channels.length, 40);
      assert.equal(body.detail.hasMoreChannels, channelCount === 41);
      assert.equal(body.detail.server.visibleChannelCount, 40);
      assert.equal(
        body.detail.server.defaultChannelId,
        channelCount === 40 ? "channel-39" : "channel-0",
      );
    }
  });

  it("caps the aggregate channel projection at 80 and reports the 81st row", async () => {
    const { mobileServerDetailRoute } = await routes;

    for (const channelCount of [80, 81]) {
      const firstCategoryChannels = Array.from({ length: 40 }, (_, index) => ({
        canAccess: true,
        categoryId: "category-1",
        id: `first-${index}`,
        locked: false,
        mentionCount: 0,
        name: `first-${index}`,
        position: index,
        readOnly: false,
        topic: null,
        type: "TEXT" as const,
        unreadCount: 0,
      }));
      const secondCategoryChannels = Array.from({ length: channelCount - 40 }, (_, index) => ({
        ...firstCategoryChannels[0]!,
        categoryId: "category-2",
        id: `second-${index}`,
        name: `second-${index}`,
        position: index,
      }));
      const boundedDetail = {
        ...detail,
        categories: [
          { channels: firstCategoryChannels, id: "category-1", name: "First", position: 0 },
          { channels: secondCategoryChannels, id: "category-2", name: "Second", position: 1 },
        ],
        server: { ...detail.server, defaultChannelId: "second-40" },
        ungroupedChannels: [],
      } satisfies WorkspaceServerDetail;

      const response = await mobileServerDetailRoute(
        request("GET"),
        context({ serverId: "server-1" }),
        dependencies({
          getServerDetailWithAccess: async () => ({
            access,
            detail: boundedDetail,
            hasMoreChannels: channelCount === 81,
          }),
        }),
      );
      const body = (await response.json()) as {
        detail: {
          categories: Array<{ channels: unknown[] }>;
          hasMoreChannels: boolean;
          server: { defaultChannelId: string | null; visibleChannelCount: number };
        };
      };

      assert.equal(response.status, 200);
      assert.equal(
        body.detail.categories.reduce((total, category) => total + category.channels.length, 0),
        80,
      );
      assert.equal(body.detail.hasMoreChannels, channelCount === 81);
      assert.equal(body.detail.server.visibleChannelCount, 80);
      assert.equal(body.detail.server.defaultChannelId, "first-0");
    }
  });

  it("propagates a raw category sentinel without exposing it and chooses only returned text defaults", async () => {
    const { mobileServerDetailRoute } = await routes;
    const boundedDetail = {
      ...detail,
      categories: Array.from({ length: 20 }, (_, index) => ({
        channels: [],
        id: `category-${index}`,
        name: `Category ${index}`,
        position: index,
      })),
      server: { ...detail.server, defaultChannelId: "voice-1" },
      ungroupedChannels: [
        {
          ...detail.ungroupedChannels[0]!,
          id: "voice-1",
          name: "voice",
          type: "VOICE" as const,
        },
        {
          ...detail.ungroupedChannels[0]!,
          id: "text-1",
          name: "text",
        },
      ],
    } satisfies WorkspaceServerDetail;

    const response = await mobileServerDetailRoute(
      request("GET"),
      context({ serverId: "server-1" }),
      dependencies({
        getServerDetailWithAccess: async () => ({
          access,
          detail: boundedDetail,
          hasMoreChannels: true,
        }),
      }),
    );
    const body = (await response.json()) as {
      detail: {
        categories: unknown[];
        hasMoreChannels: boolean;
        server: { defaultChannelId: string | null; visibleChannelCount: number };
      };
    };

    assert.equal(response.status, 200);
    assert.deepEqual(body.detail.categories, []);
    assert.equal(body.detail.hasMoreChannels, true);
    assert.equal(body.detail.server.visibleChannelCount, 2);
    assert.equal(body.detail.server.defaultChannelId, "text-1");
  });

  it("DELETE authenticates, rate limits, validates params and confirmation, then deletes", async () => {
    const { mobileServerDeleteRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerDeleteRoute(
      request("DELETE", { confirmationName: " Guild " }),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        deleteServer: async (
          userId: string,
          serverId: string,
          input: { confirmationName: string },
        ) => {
          calls.push(`service:${userId}:${serverId}:${input.confirmationName}`);
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:delete",
      "params",
      "body",
      "service:user-1:server-1:Guild",
    ]);
  });

  it("rejects invalid or non-strict server params before every service", async () => {
    const { mobileServerDeleteRoute, mobileServerDetailRoute, mobileServerUpdateRoute } =
      await routes;
    const invalidParams = [{ serverId: "" }, { extra: "value", serverId: "server-1" }];

    for (const params of invalidParams) {
      let serviceCalled = false;
      const deps = dependencies({
        deleteServer: async () => {
          serviceCalled = true;
        },
        getServerDetailWithAccess: async () => {
          serviceCalled = true;
          return { access, detail };
        },
        updateServer: async () => {
          serviceCalled = true;
          return detail;
        },
      });
      const responses = await Promise.all([
        mobileServerDetailRoute(request("GET"), context(params), deps),
        mobileServerUpdateRoute(request("PATCH", { name: "Guild" }), context(params), deps),
        mobileServerDeleteRoute(
          request("DELETE", { confirmationName: "Guild" }),
          context(params),
          deps,
        ),
      ]);

      assert.deepEqual(
        responses.map((response) => response.status),
        [400, 400, 400],
      );
      assert.equal(serviceCalled, false);
    }
  });

  it("rejects iconUrl and other non-strict update bodies before the update service", async () => {
    const { mobileServerUpdateRoute } = await routes;

    for (const body of [
      { iconUrl: null },
      { iconUrl: "https://cdn.whispr.test/new.png", name: "Guild" },
      { name: "Guild", unexpected: true },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerUpdateRoute(
        request("PATCH", body),
        context({ serverId: "server-1" }),
        dependencies({
          updateServer: async () => {
            serviceCalled = true;
            return detail;
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("requires a strict typed confirmation before the delete service", async () => {
    const { mobileServerDeleteRoute } = await routes;

    for (const body of [
      {},
      { confirmationName: 123 },
      { confirmationName: "Guild", unexpected: true },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerDeleteRoute(
        request("DELETE", body),
        context({ serverId: "server-1" }),
        dependencies({
          deleteServer: async () => {
            serviceCalled = true;
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("validates GET and PATCH service results before returning them", async () => {
    const { mobileServerDetailRoute, mobileServerUpdateRoute } = await routes;
    const invalidDetail = {
      ...detail,
      server: { ...detail.server, id: "" },
    };

    const getResponse = await mobileServerDetailRoute(
      request("GET"),
      context({ serverId: "server-1" }),
      dependencies({
        getServerDetailWithAccess: async () => ({ access, detail: invalidDetail }),
      }),
    );
    const patchResponse = await mobileServerUpdateRoute(
      request("PATCH", { name: "Guild" }),
      context({ serverId: "server-1" }),
      dependencies({
        getServerDetailWithAccess: async () => ({ access, detail: invalidDetail }),
      }),
    );

    assert.equal(getResponse.status, 400);
    assert.equal(patchResponse.status, 400);
  });

  it("maps authentication failures for every method to bounded shared errors", async () => {
    const { mobileServerDeleteRoute, mobileServerDetailRoute, mobileServerUpdateRoute } =
      await routes;
    const deps = dependencies({
      authenticate: async () => {
        throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
      },
    });

    const responses = await Promise.all([
      mobileServerDetailRoute(request("GET"), context({ serverId: "server-1" }), deps),
      mobileServerUpdateRoute(
        request("PATCH", { name: "Guild" }),
        context({ serverId: "server-1" }),
        deps,
      ),
      mobileServerDeleteRoute(
        request("DELETE", { confirmationName: "Guild" }),
        context({ serverId: "server-1" }),
        deps,
      ),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        code: "UNAUTHORIZED",
        error: "Unauthorized",
      });
    }
  });
});
