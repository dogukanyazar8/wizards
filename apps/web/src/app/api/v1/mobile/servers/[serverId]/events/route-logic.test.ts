import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerScheduledEvent } from "@wizards/types";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request(search = "", body?: unknown) {
  return new Request(`https://whispr.test/api/v1/mobile/servers/server-1/events${search}`, {
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function eventFixture(): ServerScheduledEvent {
  return {
    attendeeCount: 3,
    channelId: "c9",
    channelName: "live-room",
    description: null,
    entityType: "VOICE",
    externalLocation: null,
    id: "e1",
    interestedCount: 12,
    name: "Topluluk buluşması",
    scheduledEndAt: null,
    scheduledStartAt: "2026-08-11T18:00:00.000Z",
    serverId: "server-1",
    status: "SCHEDULED",
    viewerInterested: false,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    createEvent: async () => eventFixture(),
    enforceRateLimit: async () => undefined,
    listEvents: async () => [eventFixture()],
    parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse({
        entityType: "VOICE",
        name: "Topluluk buluşması",
        scheduledStartAt: "2026-08-11T18:00:00.000Z",
      }),
    ...overrides,
  };
}

describe("mobile server events list route logic", () => {
  it("authenticates, rate limits, and returns the server's events", async () => {
    const { mobileServerEventsListRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerEventsListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
      }) as never,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["rate:user-1:mobile:server:events:list"]);
    const payload = (await response.json()) as { events: ServerScheduledEvent[] };
    assert.equal(payload.events[0]?.id, "e1");
  });

  it("passes includePast through as a boolean, defaulting to false", async () => {
    const { mobileServerEventsListRoute } = await routes;
    const seen: boolean[] = [];
    const listEvents = async (
      _serverId: string,
      _viewerId: string,
      options: { includePast?: boolean },
    ) => {
      seen.push(options.includePast === true);
      return [eventFixture()];
    };

    await mobileServerEventsListRoute(
      request("?includePast=true"),
      context({ serverId: "server-1" }),
      dependencies({ listEvents }) as never,
    );
    await mobileServerEventsListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({ listEvents }) as never,
    );

    assert.deepEqual(seen, [true, false]);
  });

  it("rejects an unknown query parameter instead of ignoring it", async () => {
    const { mobileServerEventsListRoute } = await routes;

    const response = await mobileServerEventsListRoute(
      request("?past=1"),
      context({ serverId: "server-1" }),
      dependencies() as never,
    );

    assert.equal(response.status, 400);
  });

  it("surfaces a service error through the shared error shape", async () => {
    const { mobileServerEventsListRoute } = await routes;

    const response = await mobileServerEventsListRoute(
      request(),
      context({ serverId: "server-1" }),
      dependencies({
        listEvents: async () => {
          throw new ApiError("Server not found", 404, "SERVER_NOT_FOUND");
        },
      }) as never,
    );

    assert.equal(response.status, 404);
  });
});

describe("mobile server event create route logic", () => {
  it("creates the event under its own rate-limit action and answers 201", async () => {
    const { mobileServerEventCreateRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerEventCreateRoute(
      request("", { entityType: "VOICE" }),
      context({ serverId: "server-1" }),
      dependencies({
        createEvent: async (userId: string, serverId: string) => {
          calls.push(`create:${userId}:${serverId}`);
          return eventFixture();
        },
        enforceRateLimit: async (_userId: string, action: string) => {
          calls.push(`rate:${action}`);
        },
      }) as never,
    );

    assert.equal(response.status, 201);
    assert.deepEqual(calls, ["rate:mobile:server:events:create", "create:user-1:server-1"]);
  });

  it("refuses a body the shared contract rejects", async () => {
    const { mobileServerEventCreateRoute } = await routes;

    const response = await mobileServerEventCreateRoute(
      request("", {}),
      context({ serverId: "server-1" }),
      dependencies({
        parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
          schema.parse({ entityType: "VOICE", name: "" }),
      }) as never,
    );

    assert.equal(response.status, 400);
  });
});
