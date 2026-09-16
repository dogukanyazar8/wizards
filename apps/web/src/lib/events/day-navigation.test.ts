import assert from "node:assert/strict";
import { afterEach, it } from "node:test";

import { eventsRoute } from "@/app/api/v1/events/route-logic";
import { eventWeekDayHref } from "@/components/events/event-week-strip";
import { eventsQueryKeys, fetchEvents } from "@/lib/events/client";
import { resolveEventsTimeRange, type EventsQueryScope } from "@/lib/events/events-query";
import {
  EVENTS_DEFAULT_ROUTE_STATE,
  buildEventsHref,
  parseEventsRouteState,
} from "@/lib/events/routes";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

it("different calendar days produce distinct routes and cache entries", () => {
  const hrefs = ["2026-09-17", "2026-09-18"].map((date) =>
    eventWeekDayHref(EVENTS_DEFAULT_ROUTE_STATE, { date, isToday: false, count: 0, kinds: [] }),
  );
  assert.notEqual(hrefs[0], hrefs[1]);
  const states = hrefs.map((href) =>
    parseEventsRouteState(new URL(href, "https://whispr.test").searchParams),
  );
  assert.equal(states[0]!.date, "2026-09-17");
  assert.equal(states[1]!.date, "2026-09-18");
  assert.notDeepEqual(eventsQueryKeys.list(states[0]!), eventsQueryKeys.list(states[1]!));
});

it("day selection survives other filters; time selection replaces it", () => {
  const state = parseEventsRouteState(new URLSearchParams("date=2026-09-18&time=week"));
  assert.equal(state.date, "2026-09-18");
  assert.equal(state.time, null);
  assert.match(buildEventsHref(state, { mine: "going" }), /date=2026-09-18/u);
  assert.doesNotMatch(buildEventsHref(state, { time: "month" }), /date=/u);
});

it("invalid calendar dates never reach the query", () => {
  for (const date of ["2026-02-30", "2026-13-01", "2026-9-18", "2026-09-18' OR 1=1"]) {
    assert.equal(parseEventsRouteState(new URLSearchParams({ date })).date, null);
  }
  assert.equal(parseEventsRouteState(new URLSearchParams("date=2028-02-29")).date, "2028-02-29");
});

it("client and authenticated API carry the selected date with the pagination cursor", async () => {
  let captured: unknown;
  globalThis.fetch = async (url) =>
    eventsRoute(new Request(new URL(String(url), "https://whispr.test")), {
      authenticate: () => Promise.resolve("viewer"),
      enforceRateLimit: () => Promise.resolve(),
      listEvents: (userId, query) => {
        assert.equal(userId, "viewer");
        captured = query;
        return Promise.resolve({
          counts: { all: 0, going: 0, live: 0, liveNow: false, nextStartsAt: null, upcoming: 0 },
          items: [],
          nextCursor: null,
          week: [],
        });
      },
    });
  await fetchEvents({ tab: "all", date: "2026-09-18", cursor: "page-2", source: "s1" });
  assert.equal((captured as { date: string }).date, "2026-09-18");
  assert.equal((captured as { cursor: string }).cursor, "page-2");
  assert.equal((captured as { serverId: string }).serverId, "s1");
});

it("selected day uses viewer midnight rather than UTC or the current day", () => {
  const range = resolveEventsTimeRange({
    date: "2026-09-18",
    time: null,
    now: new Date("2026-09-16T12:00:00Z"),
    timeZone: "Europe/Istanbul",
  } as EventsQueryScope);
  assert.equal(range.from?.toISOString(), "2026-09-17T21:00:00.000Z");
  assert.equal(range.to?.toISOString(), "2026-09-18T21:00:00.000Z");
});

it("day boundaries cover both 23-hour and 25-hour DST days", () => {
  for (const [date, hours] of [
    ["2026-03-08", 23],
    ["2026-11-01", 25],
  ] as const) {
    const range = resolveEventsTimeRange({
      date,
      time: null,
      now: new Date("2026-09-16T12:00:00Z"),
      timeZone: "America/New_York",
    } as EventsQueryScope);
    assert.ok(range.from && range.to);
    assert.equal(range.to.getTime() - range.from.getTime(), hours * 3_600_000);
  }
});
