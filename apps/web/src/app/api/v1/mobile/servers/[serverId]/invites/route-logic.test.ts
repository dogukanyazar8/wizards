import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { WorkspaceInvite } from "@wizards/types";

import { ApiError, parseJsonBody } from "@/lib/api";
import { toMobileServerInvite } from "@/lib/workspace/invite-selection";

const routes = import("./route-logic");

const invite = {
  channelId: "channel-1",
  code: "INVITE_1",
  createdAt: "2026-07-13T10:00:00.000Z",
  createdByDisplayName: "Alice",
  expiresAt: "2026-07-14T10:00:00.000Z",
  id: "invite-1",
  maxUses: 10,
  targetUserId: null,
  uses: 2,
} satisfies WorkspaceInvite;

function request(method: "GET" | "POST" | "PUT", body?: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/invites", {
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

const inviteSheetUser = {
  avatarUrl: null,
  displayName: "Ayşegül",
  id: "user-2",
  username: "aysegul_dev",
};

const pendingInvite = {
  createdAt: "2026-07-13T09:00:00.000Z",
  id: "invite-2",
  user: inviteSheetUser,
};

const inviteSheet = {
  friends: [
    {
      ...inviteSheetUser,
      isMember: false,
      lastSeenAt: "2026-07-13T06:00:00.000Z",
      pendingInviteId: "invite-2",
      status: "ONLINE" as const,
    },
  ],
  // Projected, not spread: a stored invite carries `code`, which the strict
  // contract rejects — the same slip that broke the sheet on UAT.
  linkInvite: toMobileServerInvite(
    invite,
    (code) => `https://whispr.test/invite/${encodeURIComponent(code)}`,
  ),
  pendingInvites: [pendingInvite],
};

const QR_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    buildQrCode: async () => QR_DATA_URL,
    buildShareUrl: (code: string) => `https://whispr.test/invite/${encodeURIComponent(code)}`,
    createInvite: async () => invite,
    createTargetedInvite: async () => pendingInvite,
    enforceRateLimit: async () => undefined,
    getInviteSheet: async () => inviteSheet,
    listInvites: async () => [invite],
    parseBody: parseJsonBody,
    replaceLinkInvite: async () => invite,
    revokeInvite: async () => undefined,
    ...overrides,
  };
}

describe("mobile server invite route logic", () => {
  it("GET authenticates, rate limits, validates params, lists, and maps canonical URLs without codes", async () => {
    const { mobileServerInvitesListRoute } = await routes;
    const calls: string[] = [];
    const secondInvite = {
      ...invite,
      channelId: null,
      code: "INVITE_2",
      expiresAt: null,
      id: "invite-2",
      maxUses: null,
      uses: 0,
    } satisfies WorkspaceInvite;

    const response = await mobileServerInvitesListRoute(
      request("GET"),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        buildShareUrl: (code: string) => {
          calls.push(`share:${code}`);
          return `https://app.whispr.test/invite/${encodeURIComponent(code)}`;
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        listInvites: async (userId: string, serverId: string) => {
          calls.push(`service:${userId}:${serverId}`);
          return [invite, secondInvite];
        },
      }),
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      invites: Array<Record<string, unknown>>;
    };
    assert.deepEqual(payload, {
      invites: [
        {
          channelId: "channel-1",
          createdAt: "2026-07-13T10:00:00.000Z",
          createdByDisplayName: "Alice",
          expiresAt: "2026-07-14T10:00:00.000Z",
          id: "invite-1",
          maxUses: 10,
          shareUrl: "https://app.whispr.test/invite/INVITE_1",
          // Ş3 · K10: hedefli davet mobil sözleşmede de görünür oldu.
          targetUserId: null,
          uses: 2,
        },
        {
          channelId: null,
          createdAt: "2026-07-13T10:00:00.000Z",
          createdByDisplayName: "Alice",
          expiresAt: null,
          id: "invite-2",
          maxUses: null,
          shareUrl: "https://app.whispr.test/invite/INVITE_2",
          targetUserId: null,
          uses: 0,
        },
      ],
    });
    assert.equal(
      payload.invites.some((item) => "code" in item),
      false,
    );
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:invites:list",
      "params",
      "service:user-1:server-1",
      "share:INVITE_1",
      "share:INVITE_2",
    ]);
  });

  it("POST validates the body after params, creates with details, and returns a strict invite without code", async () => {
    const { mobileServerInviteCreateRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerInviteCreateRoute(
      request("POST", {
        channelId: " channel-1 ",
        expiresInHours: 24,
        maxUses: 10,
      }),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        buildShareUrl: (code: string) => {
          calls.push(`share:${code}`);
          return `https://app.whispr.test/invite/${encodeURIComponent(code)}`;
        },
        createInvite: async (
          userId: string,
          serverId: string,
          input: {
            channelId?: string | null;
            expiresInHours?: number | null;
            maxUses?: number | null;
          },
        ) => {
          calls.push(
            `service:${userId}:${serverId}:${String(input.channelId)}:${String(input.expiresInHours)}:${String(input.maxUses)}`,
          );
          return invite;
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
      }),
    );

    assert.equal(response.status, 201);
    const payload = (await response.json()) as { invite: Record<string, unknown> };
    assert.deepEqual(payload, {
      invite: {
        channelId: "channel-1",
        createdAt: "2026-07-13T10:00:00.000Z",
        createdByDisplayName: "Alice",
        expiresAt: "2026-07-14T10:00:00.000Z",
        id: "invite-1",
        maxUses: 10,
        shareUrl: "https://app.whispr.test/invite/INVITE_1",
        targetUserId: null,
        uses: 2,
      },
    });
    assert.equal("code" in payload.invite, false);
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:invites:create",
      "params",
      "body",
      "service:user-1:server-1:channel-1:24:10",
      "share:INVITE_1",
    ]);
  });

  it("rejects invalid or non-strict server params before body parsing and services", async () => {
    const { mobileServerInviteCreateRoute, mobileServerInvitesListRoute } = await routes;

    for (const params of [
      { serverId: "" },
      { extra: "value", serverId: "server-1" },
      { serverId: "s".repeat(129) },
    ]) {
      const calls: string[] = [];
      const deps = dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        createInvite: async () => {
          calls.push("create");
          return invite;
        },
        enforceRateLimit: async () => {
          calls.push("rate");
        },
        listInvites: async () => {
          calls.push("list");
          return [invite];
        },
        parseBody: async () => {
          calls.push("body");
          return {};
        },
      });

      const getResponse = await mobileServerInvitesListRoute(
        request("GET"),
        context(params, () => calls.push("params")),
        deps,
      );
      assert.equal(getResponse.status, 400);
      assert.deepEqual(calls, ["auth", "rate", "params"]);

      calls.length = 0;
      const postResponse = await mobileServerInviteCreateRoute(
        request("POST", {}),
        context(params, () => calls.push("params")),
        deps,
      );
      assert.equal(postResponse.status, 400);
      assert.deepEqual(calls, ["auth", "rate", "params"]);
    }
  });

  it("rejects non-strict or invalid POST bodies before the create service", async () => {
    const { mobileServerInviteCreateRoute } = await routes;

    for (const body of [
      { unexpected: true },
      { channelId: "c".repeat(129) },
      { maxUses: 0 },
      { expiresInHours: 721 },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerInviteCreateRoute(
        request("POST", body),
        context({ serverId: "server-1" }),
        dependencies({
          createInvite: async () => {
            serviceCalled = true;
            return invite;
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("enforces the strict HTTPS response contract and invite list bound", async () => {
    const { mobileServerInviteCreateRoute, mobileServerInvitesListRoute } = await routes;

    const insecureResponse = await mobileServerInviteCreateRoute(
      request("POST", {}),
      context({ serverId: "server-1" }),
      dependencies({ buildShareUrl: () => "http://app.whispr.test/invite/INVITE_1" }),
    );
    assert.equal(insecureResponse.status, 400);
    assert.deepEqual(Object.keys((await insecureResponse.json()) as Record<string, unknown>), [
      "error",
    ]);

    const oversizedResponse = await mobileServerInvitesListRoute(
      request("GET"),
      context({ serverId: "server-1" }),
      dependencies({
        listInvites: async () =>
          Array.from({ length: 101 }, (_, index) => ({
            ...invite,
            code: `INVITE_${index}`,
            id: `invite-${index}`,
          })),
      }),
    );
    assert.equal(oversizedResponse.status, 400);
    assert.deepEqual(Object.keys((await oversizedResponse.json()) as Record<string, unknown>), [
      "error",
    ]);
  });

  it("returns bounded rate-limit errors before params, bodies, and services", async () => {
    const { mobileServerInviteCreateRoute, mobileServerInvitesListRoute } = await routes;
    let paramsRead = false;
    let laterDependencyCalled = false;
    const deps = dependencies({
      createInvite: async () => {
        laterDependencyCalled = true;
        return invite;
      },
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
      },
      listInvites: async () => {
        laterDependencyCalled = true;
        return [invite];
      },
      parseBody: async () => {
        laterDependencyCalled = true;
        return {};
      },
    });

    const responses = await Promise.all([
      mobileServerInvitesListRoute(
        request("GET"),
        context({ serverId: "server-1" }, () => {
          paramsRead = true;
        }),
        deps,
      ),
      mobileServerInviteCreateRoute(
        request("POST", {}),
        context({ serverId: "server-1" }, () => {
          paramsRead = true;
        }),
        deps,
      ),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), {
        code: "RATE_LIMITED",
        error: "Too many requests. Please try again shortly.",
      });
    }
    assert.equal(paramsRead, false);
    assert.equal(laterDependencyCalled, false);
  });

  it("DELETE authenticates, rate limits, validates params, and revokes the invite", async () => {
    const { mobileServerInviteRevokeRoute } = await routes;
    const calls: Array<{ userId: string; serverId: string; inviteId: string }> = [];
    let rateLimitAction: string | null = null;
    const response = await mobileServerInviteRevokeRoute(
      new Request("https://whispr.test/api/v1/mobile/servers/server-1/invites/invite-1", {
        method: "DELETE",
      }),
      context({ inviteId: "invite-1", serverId: "server-1" }),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          rateLimitAction = action;
        },
        revokeInvite: async (userId: string, serverId: string, inviteId: string) => {
          calls.push({ inviteId, serverId, userId });
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(rateLimitAction, "mobile:server:invites:revoke");
    assert.deepEqual(calls, [{ inviteId: "invite-1", serverId: "server-1", userId: "user-1" }]);
  });

  it("DELETE rejects a malformed invite id before revoking", async () => {
    const { mobileServerInviteRevokeRoute } = await routes;
    let revokeCalled = false;
    const response = await mobileServerInviteRevokeRoute(
      new Request("https://whispr.test/api/v1/mobile/servers/server-1/invites/x", {
        method: "DELETE",
      }),
      context({ inviteId: "", serverId: "server-1" }),
      dependencies({
        revokeInvite: async () => {
          revokeCalled = true;
        },
      }),
    );

    assert.equal(response.status >= 400, true);
    assert.equal(revokeCalled, false);
  });
});

describe("mobile invite sheet route logic", () => {
  it("GET returns the link, friends and pending invites in one uncached read", async () => {
    const { mobileServerInviteSheetRoute } = await routes;
    const calls: string[] = [];
    const response = await mobileServerInviteSheetRoute(
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
        getInviteSheet: async (userId: string, serverId: string) => {
          calls.push(`sheet:${userId}:${serverId}`);
          return inviteSheet;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
    assert.deepEqual(await response.json(), inviteSheet);
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:invites:sheet",
      "params",
      "sheet:user-1:server-1",
    ]);
  });

  it("GET rejects a malformed server id before reading the sheet", async () => {
    const { mobileServerInviteSheetRoute } = await routes;
    let sheetCalled = false;
    const response = await mobileServerInviteSheetRoute(
      request("GET"),
      context({ serverId: "" }),
      dependencies({
        getInviteSheet: async () => {
          sheetCalled = true;
          return inviteSheet;
        },
      }),
    );

    assert.equal(response.status >= 400, true);
    assert.equal(sheetCalled, false);
  });

  it("GET surfaces a permission failure instead of an empty sheet", async () => {
    const { mobileServerInviteSheetRoute } = await routes;
    const response = await mobileServerInviteSheetRoute(
      request("GET"),
      context({ serverId: "server-1" }),
      dependencies({
        getInviteSheet: async () => {
          throw new ApiError("Missing permission", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("PUT replaces the shared link with the requested lifetime", async () => {
    const { mobileServerInviteLinkUpdateRoute } = await routes;
    const calls: Array<{ input: unknown; serverId: string; userId: string }> = [];
    let rateLimitAction: string | null = null;
    const response = await mobileServerInviteLinkUpdateRoute(
      request("PUT", { expiresInHours: 24, maxUses: 10 }),
      context({ serverId: "server-1" }),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          rateLimitAction = action;
        },
        replaceLinkInvite: async (userId: string, serverId: string, input: unknown) => {
          calls.push({ input, serverId, userId });
          return invite;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      invite: {
        channelId: invite.channelId,
        createdAt: invite.createdAt,
        createdByDisplayName: invite.createdByDisplayName,
        expiresAt: invite.expiresAt,
        id: invite.id,
        maxUses: invite.maxUses,
        shareUrl: "https://whispr.test/invite/INVITE_1",
        targetUserId: invite.targetUserId,
        uses: invite.uses,
      },
    });
    assert.equal(rateLimitAction, "mobile:server:invites:create");
    assert.deepEqual(calls, [
      { input: { expiresInHours: 24, maxUses: 10 }, serverId: "server-1", userId: "user-1" },
    ]);
  });

  it("PUT rejects a lifetime outside the sheet's options", async () => {
    const { mobileServerInviteLinkUpdateRoute } = await routes;
    let replaceCalled = false;
    const response = await mobileServerInviteLinkUpdateRoute(
      request("PUT", { expiresInHours: 5000, maxUses: null }),
      context({ serverId: "server-1" }),
      dependencies({
        replaceLinkInvite: async () => {
          replaceCalled = true;
          return invite;
        },
      }),
    );

    assert.equal(response.status >= 400, true);
    assert.equal(replaceCalled, false);
  });

  it("POST targeted creates a single-seat invite for the named user", async () => {
    const { mobileServerTargetedInviteCreateRoute } = await routes;
    const calls: Array<{ serverId: string; targetUserId: string; userId: string }> = [];
    let rateLimitAction: string | null = null;
    const response = await mobileServerTargetedInviteCreateRoute(
      request("POST", { userId: "user-2" }),
      context({ serverId: "server-1" }),
      dependencies({
        createTargetedInvite: async (userId: string, serverId: string, targetUserId: string) => {
          calls.push({ serverId, targetUserId, userId });
          return pendingInvite;
        },
        enforceRateLimit: async (_userId: string, action: string) => {
          rateLimitAction = action;
        },
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { invite: pendingInvite });
    assert.equal(rateLimitAction, "mobile:server:invites:target");
    assert.deepEqual(calls, [{ serverId: "server-1", targetUserId: "user-2", userId: "user-1" }]);
  });

  it("POST targeted rejects an unknown body key and a missing user", async () => {
    const { mobileServerTargetedInviteCreateRoute } = await routes;
    let createCalled = false;
    const deps = dependencies({
      createTargetedInvite: async () => {
        createCalled = true;
        return pendingInvite;
      },
    });

    const extraKey = await mobileServerTargetedInviteCreateRoute(
      request("POST", { serverId: "server-1", userId: "user-2" }),
      context({ serverId: "server-1" }),
      deps,
    );
    const missingUser = await mobileServerTargetedInviteCreateRoute(
      request("POST", {}),
      context({ serverId: "server-1" }),
      deps,
    );

    assert.equal(extraKey.status >= 400, true);
    assert.equal(missingUser.status >= 400, true);
    assert.equal(createCalled, false);
  });

  it("POST targeted surfaces the already-pending conflict verbatim", async () => {
    const { mobileServerTargetedInviteCreateRoute } = await routes;
    const response = await mobileServerTargetedInviteCreateRoute(
      request("POST", { userId: "user-2" }),
      context({ serverId: "server-1" }),
      dependencies({
        createTargetedInvite: async () => {
          throw new ApiError(
            "This user already has a pending invite",
            409,
            "INVITE_ALREADY_PENDING",
          );
        },
      }),
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      code: "INVITE_ALREADY_PENDING",
      error: "This user already has a pending invite",
    });
  });

  it("GET qr returns a PNG data URL for the named invite", async () => {
    const { mobileServerInviteQrRoute } = await routes;
    const calls: Array<{ inviteId: string; serverId: string; userId: string }> = [];
    let rateLimitAction: string | null = null;
    const response = await mobileServerInviteQrRoute(
      request("GET"),
      context({ inviteId: "invite-1", serverId: "server-1" }),
      dependencies({
        buildQrCode: async (userId: string, serverId: string, inviteId: string) => {
          calls.push({ inviteId, serverId, userId });
          return QR_DATA_URL;
        },
        enforceRateLimit: async (_userId: string, action: string) => {
          rateLimitAction = action;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { qrCodeDataUrl: QR_DATA_URL });
    assert.equal(rateLimitAction, "mobile:server:invites:qr");
    assert.deepEqual(calls, [{ inviteId: "invite-1", serverId: "server-1", userId: "user-1" }]);
  });

  it("GET qr refuses to pass a non-PNG payload through the contract", async () => {
    const { mobileServerInviteQrRoute } = await routes;
    const response = await mobileServerInviteQrRoute(
      request("GET"),
      context({ inviteId: "invite-1", serverId: "server-1" }),
      dependencies({ buildQrCode: async () => "https://whispr.test/qr.png" }),
    );

    assert.equal(response.status >= 400, true);
  });
});
