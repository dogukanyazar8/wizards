import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { EventRsvp } from "@wizards/types";

import { eventRsvpRoute, type EventRsvpRouteDependencies } from "./route-logic";

const EVENT_ID = "evt-1";
const USER_ID = "user-1";

function request(body: unknown): Request {
  return new Request(`https://whispr.test/api/v1/events/${EVENT_ID}/rsvp`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

const COUNTS = {
  all: 4,
  going: 2,
  live: 1,
  liveNow: true,
  nextStartsAt: "2026-09-01T15:00:00.000Z",
  upcoming: 3,
};

function response(scheduled = true) {
  return { counts: COUNTS, event: { id: EVENT_ID, rsvp: "going" }, scheduled } as never;
}

function dependencies(overrides: Partial<EventRsvpRouteDependencies> = {}): {
  deps: EventRsvpRouteDependencies;
  rateActions: string[];
  seen: (EventRsvp | null)[];
} {
  const rateActions: string[] = [];
  const seen: (EventRsvp | null)[] = [];

  return {
    deps: {
      authenticate: () => Promise.resolve(USER_ID),
      enforceRateLimit: (_userId, action) => {
        rateActions.push(action);
        return Promise.resolve();
      },
      parseBody: async (incoming, schema) => schema.parse(await incoming.json()),
      setRsvp: (_userId, _eventId, rsvp) => {
        seen.push(rsvp);
        return Promise.resolve(response());
      },
      ...overrides,
    },
    rateActions,
    seen,
  };
}

describe("PUT /api/v1/events/[eventId]/rsvp", () => {
  it("hedef durumu geçirir ve sayaçlarla birlikte döner", async () => {
    const { deps, rateActions, seen } = dependencies();

    const result = await eventRsvpRoute(request({ rsvp: "going" }), EVENT_ID, deps);
    const body = (await result.json()) as Record<string, unknown>;

    assert.equal(result.status, 200);
    assert.deepEqual(seen, ["going"]);
    assert.deepEqual(rateActions, ["events:rsvp"]);
    assert.deepEqual(body.counts, COUNTS);
    assert.equal(body.scheduled, true);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  });

  it("null kabul eder — katılımı geri alma bir hedef durumdur", async () => {
    const { deps, seen } = dependencies();

    await eventRsvpRoute(request({ rsvp: null }), EVENT_ID, deps);

    assert.deepEqual(seen, [null]);
  });

  it("maybe kabul eder", async () => {
    const { deps, seen } = dependencies();

    await eventRsvpRoute(request({ rsvp: "maybe" }), EVENT_ID, deps);

    assert.deepEqual(seen, ["maybe"]);
  });

  it("tanınmayan yanıtı 400 ile reddeder — toggle gövdesi de buraya düşer", async () => {
    const { deps } = dependencies();

    const result = await eventRsvpRoute(request({ interested: true }), EVENT_ID, deps);

    assert.equal(result.status, 400);
  });

  it("görünmeyen etkinlikte 404 döner, 403 değil", async () => {
    // 403 etkinliğin varlığını sızdırırdı.
    const { deps } = dependencies({
      setRsvp: () =>
        Promise.reject(new ApiError("Event not found", 404, "SCHEDULED_EVENT_NOT_FOUND")),
    });

    const result = await eventRsvpRoute(request({ rsvp: "going" }), EVENT_ID, deps);

    assert.equal(result.status, 404);
    assert.equal(((await result.json()) as { code: string }).code, "SCHEDULED_EVENT_NOT_FOUND");
  });

  it("oturumsuz isteği servise hiç götürmez", async () => {
    let called = false;
    const { deps } = dependencies({
      authenticate: () => Promise.reject(new ApiError("Unauthorized", 401)),
      setRsvp: () => {
        called = true;
        return Promise.resolve(response());
      },
    });

    const result = await eventRsvpRoute(request({ rsvp: "going" }), EVENT_ID, deps);

    assert.equal(result.status, 401);
    assert.equal(called, false);
  });

  it("etkinlik çok yakınsa scheduled:false taşır", async () => {
    const { deps } = dependencies({ setRsvp: () => Promise.resolve(response(false)) });

    const result = await eventRsvpRoute(request({ rsvp: "going" }), EVENT_ID, deps);

    assert.equal(((await result.json()) as { scheduled: boolean }).scheduled, false);
  });
});
