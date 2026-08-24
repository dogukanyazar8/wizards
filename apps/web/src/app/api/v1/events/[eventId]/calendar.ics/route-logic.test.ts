import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

import { eventCalendarIcsRoute, type EventCalendarIcsRouteDependencies } from "./route-logic";

const EVENT_ID = "evt-1";
const USER_ID = "user-1";
const NOW = new Date("2026-08-21T09:30:00.000Z");

function request(): Request {
  return new Request(`https://whispr.test/api/v1/events/${EVENT_ID}/calendar.ics`);
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    channelLabel: "#tasarım-kritiği",
    description: "Ölçüler; tipografi ve şablonlar.",
    durationMinutes: 45,
    endsAt: null,
    id: EVENT_ID,
    serverName: "Whispr Topluluğu",
    startsAt: "2026-09-01T15:00:00.000Z",
    title: "Tasarım Kritiği",
    ...overrides,
  } as never;
}

function dependencies(overrides: Partial<EventCalendarIcsRouteDependencies> = {}) {
  const rateActions: string[] = [];

  return {
    deps: {
      authenticate: () => Promise.resolve(USER_ID),
      enforceRateLimit: (_userId: string, action: string) => {
        rateActions.push(action);
        return Promise.resolve();
      },
      loadEvent: () => Promise.resolve(detail()),
      now: () => NOW,
      resolveOrigin: () => new URL("https://whispr.test"),
      ...overrides,
    } as EventCalendarIcsRouteDependencies,
    rateActions,
  };
}

describe("GET /api/v1/events/[eventId]/calendar.ics", () => {
  it("takvim başlıklarıyla birlikte döner", async () => {
    const { deps, rateActions } = dependencies();

    const result = await eventCalendarIcsRoute(request(), EVENT_ID, deps);

    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Content-Type"), "text/calendar; charset=utf-8");
    assert.equal(
      result.headers.get("Content-Disposition"),
      'attachment; filename="tasarim-kritigi.ics"',
    );
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(rateActions, ["events:ics"]);
  });

  it("gövde CRLF ve UTC DTSTART taşır", async () => {
    const { deps } = dependencies();

    const body = await (await eventCalendarIcsRoute(request(), EVENT_ID, deps)).text();
    const lines = body.split("\r\n");

    assert.ok(lines.includes("BEGIN:VEVENT"));
    assert.ok(lines.includes("DTSTART:20260901T150000Z"));
    assert.ok(lines.includes("DTEND:20260901T154500Z"));
    assert.ok(lines.includes("DTSTAMP:20260821T093000Z"));
    assert.equal(body.replaceAll("\r\n", "").includes("\n"), false);
  });

  it("yeri sunucu ve kanal adından kurar", async () => {
    const { deps } = dependencies();

    const body = await (await eventCalendarIcsRoute(request(), EVENT_ID, deps)).text();

    assert.ok(
      body.replaceAll("\r\n ", "").includes("LOCATION:Whispr Topluluğu › #tasarım-kritiği"),
    );
  });

  it("mutlak uygulama adresi yazar", async () => {
    const { deps } = dependencies();

    const body = await (await eventCalendarIcsRoute(request(), EVENT_ID, deps)).text();

    assert.ok(body.replaceAll("\r\n ", "").includes("URL:https://whispr.test/events?panel=evt-1"));
  });

  it("origin çözülemezse göreli adrese düşer, satırı atmaz", async () => {
    const { deps } = dependencies({ resolveOrigin: () => null });

    const body = await (await eventCalendarIcsRoute(request(), EVENT_ID, deps)).text();

    assert.ok(body.replaceAll("\r\n ", "").includes("URL:/events?panel=evt-1"));
  });

  it("görünmeyen etkinlikte 404 döner", async () => {
    const { deps } = dependencies({
      loadEvent: () =>
        Promise.reject(new ApiError("Event not found", 404, "SCHEDULED_EVENT_NOT_FOUND")),
    });

    const result = await eventCalendarIcsRoute(request(), EVENT_ID, deps);

    assert.equal(result.status, 404);
  });

  it("oturumsuz istek etkinliği hiç okumaz", async () => {
    let read = false;
    const { deps } = dependencies({
      authenticate: () => Promise.reject(new ApiError("Unauthorized", 401)),
      loadEvent: () => {
        read = true;
        return Promise.resolve(detail());
      },
    });

    const result = await eventCalendarIcsRoute(request(), EVENT_ID, deps);

    assert.equal(result.status, 401);
    assert.equal(read, false);
  });
});
