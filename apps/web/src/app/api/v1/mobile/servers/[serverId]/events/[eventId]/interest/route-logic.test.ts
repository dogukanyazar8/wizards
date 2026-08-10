import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerScheduledEvent } from "@wizards/types";

const routes = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/events/e1/interest", {
    body: JSON.stringify({ interested: true }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function eventFixture(viewerInterested: boolean): ServerScheduledEvent {
  return {
    attendeeCount: 0,
    channelId: null,
    channelName: null,
    description: null,
    entityType: "VOICE",
    externalLocation: null,
    id: "e1",
    interestedCount: viewerInterested ? 1 : 0,
    name: "Topluluk buluşması",
    scheduledEndAt: null,
    scheduledStartAt: "2026-08-11T18:00:00.000Z",
    serverId: "server-1",
    status: "SCHEDULED",
    viewerInterested,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
      schema.parse({ interested: true }),
    setInterest: async (
      _userId: string,
      _serverId: string,
      _eventId: string,
      interested: boolean,
    ) => eventFixture(interested),
    ...overrides,
  };
}

describe("mobile server event interest route logic", () => {
  it("sends the desired state rather than toggling whatever the server holds", async () => {
    const { mobileServerEventInterestRoute } = await routes;
    const seen: boolean[] = [];
    const setInterest = async (
      _userId: string,
      _serverId: string,
      _eventId: string,
      interested: boolean,
    ) => {
      seen.push(interested);
      return eventFixture(interested);
    };

    const on = await mobileServerEventInterestRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({ setInterest }) as never,
    );
    const off = await mobileServerEventInterestRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({
        parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
          schema.parse({ interested: false }),
        setInterest,
      }) as never,
    );

    assert.deepEqual(seen, [true, false]);
    assert.equal(
      ((await on.json()) as { event: ServerScheduledEvent }).event.viewerInterested,
      true,
    );
    assert.equal(
      ((await off.json()) as { event: ServerScheduledEvent }).event.viewerInterested,
      false,
    );
  });

  it("spends its own rate-limit budget", async () => {
    const { mobileServerEventInterestRoute } = await routes;
    const actions: string[] = [];

    await mobileServerEventInterestRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }) as never,
    );

    assert.deepEqual(actions, ["mobile:server:events:interest"]);
  });

  it("rejects a body without the desired state", async () => {
    const { mobileServerEventInterestRoute } = await routes;

    const response = await mobileServerEventInterestRoute(
      request(),
      context({ eventId: "e1", serverId: "server-1" }),
      dependencies({
        parseBody: async (_request: Request, schema: { parse: (value: unknown) => unknown }) =>
          schema.parse({}),
      }) as never,
    );

    assert.equal(response.status, 400);
  });
});
