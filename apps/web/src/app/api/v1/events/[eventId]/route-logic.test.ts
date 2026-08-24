import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import type { EventDetailResponse } from "@/lib/events/detail-service";
import { UNAUTHENTICATED, readJson, recordRateLimit } from "@/lib/home/home-test-doubles";

import { eventDetailRoute, type EventDetailRouteDependencies } from "./route-logic";

const DETAIL: EventDetailResponse = {
  attendeeMoreCount: 0,
  attendeeNextCursor: null,
  attendeePreview: [],
  attendees: [{ avatarUrl: null, id: "host-1", initials: "SA", name: "Selin Aksoy", role: "host" }],
  canJoinLive: false,
  channelId: "c1",
  channelLabel: "tasarım-kritiği",
  dayBucket: "today",
  description: "",
  durationMinutes: 45,
  endsAt: "2026-08-21T15:45:00.000Z",
  goingCount: 3,
  host: { avatarUrl: null, id: "host-1", initials: "SA", name: "Selin Aksoy" },
  id: "e1",
  isLive: false,
  isPublic: false,
  joinHref: "/channels/s1/c1",
  kind: "voice",
  maybeCount: 1,
  recurrenceRule: null,
  reminder: null,
  reminderSuppressed: false,
  rsvp: null,
  serverId: "s1",
  serverName: "Whispr Topluluğu",
  startsAt: "2026-08-21T15:00:00.000Z",
  startsInMinutes: null,
  title: "Tasarım Kritiği",
  viewerCanManage: false,
  viewerIsMember: true,
};

function dependencies(
  overrides: Partial<EventDetailRouteDependencies> = {},
): EventDetailRouteDependencies {
  return {
    authenticate: () => Promise.resolve("viewer-1"),
    enforceRateLimit: () => Promise.resolve(),
    getEventDetail: () => Promise.resolve(DETAIL),
    ...overrides,
  };
}

const REQUEST = new Request("https://whispr.test/api/v1/events/e1");

describe("GET /api/v1/events/[eventId]", () => {
  it("oturumsuz isteği reddeder", async () => {
    const response = await eventDetailRoute(
      REQUEST,
      "e1",
      dependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
  });

  it("kendi hız bütçesinden düşer", async () => {
    assert.deepEqual(API_RATE_LIMITS["events:detail"], { limit: 120, windowSeconds: 60 });

    const recorded: string[] = [];
    await eventDetailRoute(
      REQUEST,
      "e1",
      dependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["events:detail"]);
  });

  it("kimliği ve attendeeCursor'ı servise geçirir", async () => {
    const seen: { cursor: string | null | undefined; eventId: string; viewerId: string }[] = [];

    await eventDetailRoute(
      new Request("https://whispr.test/api/v1/events/e1?attendeeCursor=abc"),
      "e1",
      dependencies({
        getEventDetail: (viewerId, eventId, options) => {
          seen.push({ cursor: options.attendeeCursor, eventId, viewerId });
          return Promise.resolve(DETAIL);
        },
      }),
    );

    assert.deepEqual(seen, [{ cursor: "abc", eventId: "e1", viewerId: "viewer-1" }]);
  });

  it("adres çubuğundan gelen kodlanmış kimliği çözer", async () => {
    const seen: string[] = [];

    await eventDetailRoute(
      REQUEST,
      "e%201",
      dependencies({
        getEventDetail: (_viewerId, eventId) => {
          seen.push(eventId);
          return Promise.resolve(DETAIL);
        },
      }),
    );

    assert.deepEqual(seen, ["e 1"]);
  });

  it("görmediği etkinlikte 404 döner, 403 DEĞİL", async () => {
    const response = await eventDetailRoute(
      REQUEST,
      "e1",
      dependencies({
        getEventDetail: () =>
          Promise.reject(new ApiError("Event not found", 404, "SCHEDULED_EVENT_NOT_FOUND")),
      }),
    );

    assert.equal(response.status, 404);
    assert.equal((await readJson(response)).code, "SCHEDULED_EVENT_NOT_FOUND");
  });

  it("yanıtı şemadan geçirir ve önbelleklemez", async () => {
    const response = await eventDetailRoute(REQUEST, "e1", dependencies());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal((await readJson(response)).id, "e1");
  });

  it("sözleşme dışı bir yanıtı yayımlamaz", async () => {
    const response = await eventDetailRoute(
      REQUEST,
      "e1",
      dependencies({
        getEventDetail: () =>
          Promise.resolve({ ...DETAIL, dayBucket: "yarın" } as unknown as EventDetailResponse),
      }),
    );

    assert.notEqual(response.status, 200);
  });

  it("boş kimlikle servise hiç gitmez", async () => {
    let called = false;
    const response = await eventDetailRoute(
      REQUEST,
      "",
      dependencies({
        getEventDetail: () => {
          called = true;
          return Promise.resolve(DETAIL);
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(called, false);
  });
});
