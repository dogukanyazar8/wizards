import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerScheduledEvent } from "@wizards/types";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/events/e1", {
    method: "PATCH",
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function eventFixture(overrides: Partial<ServerScheduledEvent> = {}): ServerScheduledEvent {
  return {
    attendeeCount: 0,
    channelId: null,
    channelName: null,
    description: null,
    entityType: "VOICE",
    externalLocation: null,
    id: "e1",
    interestedCount: 0,
    name: "Topluluk buluşması",
    scheduledEndAt: null,
    scheduledStartAt: "2026-08-11T18:00:00.000Z",
    serverId: "server-1",
    status: "SCHEDULED",
    viewerInterested: false,
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    cancelEvent: async () => eventFixture({ status: "CANCELLED" }),
    enforceRateLimit: async () => undefined,
    parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse({ name: "Yeni ad" }),
    updateEvent: async () => eventFixture({ name: "Yeni ad" }),
    ...overrides,
  };
}

describe("mobile server event update route logic", () => {
  it("resolves both path params and forwards them to the service", async () => {
    const { mobileServerEventUpdateRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerEventUpdateRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          calls.push(`rate:${action}`);
        },
        updateEvent: async (userId: string, serverId: string, eventId: string) => {
          calls.push(`update:${userId}:${serverId}:${eventId}`);
          return eventFixture({ name: "Yeni ad" });
        },
      }) as never,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["rate:mobile:server:events:update", "update:user-1:server-1:e1"]);
  });

  it("rejects an update body with no fields at all", async () => {
    const { mobileServerEventUpdateRoute } = await routes;

    const response = await mobileServerEventUpdateRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({
        parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
          schema.parse({}),
      }) as never,
    );

    assert.equal(response.status, 400);
  });

  it("passes a permission failure through untouched", async () => {
    const { mobileServerEventUpdateRoute } = await routes;

    const response = await mobileServerEventUpdateRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({
        updateEvent: async () => {
          throw new ApiError("Missing permission", 403);
        },
      }) as never,
    );

    assert.equal(response.status, 403);
  });
});

describe("mobile server event cancel route logic", () => {
  it("answers with the cancelled event rather than an empty body", async () => {
    const { mobileServerEventCancelRoute } = await routes;

    const response = await mobileServerEventCancelRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies() as never,
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { event: ServerScheduledEvent };
    assert.equal(payload.event.status, "CANCELLED");
  });

  it("reads no request body -- the path and the session are the whole request", async () => {
    const { mobileServerEventCancelRoute } = await routes;
    let parsed = false;

    await mobileServerEventCancelRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({
        parseBody: async () => {
          parsed = true;
          return {};
        },
      }) as never,
    );

    assert.equal(parsed, false);
  });
});
