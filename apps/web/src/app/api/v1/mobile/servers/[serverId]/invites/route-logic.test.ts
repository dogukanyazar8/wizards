import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { WorkspaceInvite } from "@wizards/types";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

const invite = {
  channelId: "channel-1",
  code: "INVITE_1",
  createdAt: "2026-07-13T10:00:00.000Z",
  createdByDisplayName: "Alice",
  expiresAt: "2026-07-14T10:00:00.000Z",
  id: "invite-1",
  maxUses: 10,
  uses: 2,
} satisfies WorkspaceInvite;

function request(method: "GET" | "POST", body?: unknown) {
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

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    buildShareUrl: (code: string) => `https://whispr.test/invite/${encodeURIComponent(code)}`,
    createInvite: async () => invite,
    enforceRateLimit: async () => undefined,
    listInvites: async () => [invite],
    parseBody: parseJsonBody,
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
});
