import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { SetEventReminderInput } from "@wizards/types";

import { eventReminderRoute, type EventReminderRouteDependencies } from "./route-logic";

const EVENT_ID = "evt-1";
const USER_ID = "user-1";

function request(body: unknown): Request {
  return new Request(`https://whispr.test/api/v1/events/${EVENT_ID}/reminder`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

function response(scheduled: boolean) {
  return {
    counts: {
      all: 1,
      going: 1,
      live: 0,
      liveNow: false,
      nextStartsAt: "2026-09-01T15:00:00.000Z",
      upcoming: 1,
    },
    event: { id: EVENT_ID },
    scheduled,
  } as never;
}

function dependencies(overrides: Partial<EventReminderRouteDependencies> = {}) {
  const seen: SetEventReminderInput[] = [];
  const rateActions: string[] = [];

  return {
    deps: {
      authenticate: () => Promise.resolve(USER_ID),
      enforceRateLimit: (_userId: string, action: string) => {
        rateActions.push(action);
        return Promise.resolve();
      },
      parseBody: async (incoming: Request, schema: { parse: (value: unknown) => unknown }) =>
        schema.parse(await incoming.json()),
      setReminder: (_userId: string, _eventId: string, input: SetEventReminderInput) => {
        seen.push(input);
        return Promise.resolve(response(true));
      },
      ...overrides,
    } as EventReminderRouteDependencies,
    rateActions,
    seen,
  };
}

describe("PUT /api/v1/events/[eventId]/reminder", () => {
  it("tercihi geçirir", async () => {
    const { deps, rateActions, seen } = dependencies();

    const result = await eventReminderRoute(
      request({ enabled: true, minutesBefore: 30 }),
      EVENT_ID,
      deps,
    );

    assert.equal(result.status, 200);
    assert.deepEqual(seen, [{ enabled: true, minutesBefore: 30 }]);
    assert.deepEqual(rateActions, ["events:reminder"]);
  });

  it("beş seçeneğin tamamını kabul eder", async () => {
    for (const minutesBefore of [5, 10, 15, 30, 60]) {
      const { deps } = dependencies();
      const result = await eventReminderRoute(
        request({ enabled: true, minutesBefore }),
        EVENT_ID,
        deps,
      );

      assert.equal(result.status, 200, `${minutesBefore} dk reddedildi`);
    }
  });

  it("listede olmayan dakikayı 400 ile reddeder", async () => {
    // Serbest sayı kabul etmek, `availableAt` hesabını öngörülemez bir kuyruğa çevirirdi.
    const { deps } = dependencies();

    const result = await eventReminderRoute(
      request({ enabled: true, minutesBefore: 7 }),
      EVENT_ID,
      deps,
    );

    assert.equal(result.status, 400);
  });

  it("etkinlik çok yakınsa scheduled:false döner (tuzak #8)", async () => {
    const { deps } = dependencies({ setReminder: () => Promise.resolve(response(false)) });

    const result = await eventReminderRoute(
      request({ enabled: true, minutesBefore: 10 }),
      EVENT_ID,
      deps,
    );

    assert.equal(((await result.json()) as { scheduled: boolean }).scheduled, false);
  });

  it("kapatma isteği de aynı uçtan geçer", async () => {
    const { deps, seen } = dependencies();

    await eventReminderRoute(request({ enabled: false, minutesBefore: 10 }), EVENT_ID, deps);

    assert.deepEqual(seen, [{ enabled: false, minutesBefore: 10 }]);
  });

  it("görünmeyen etkinlikte 404", async () => {
    const { deps } = dependencies({
      setReminder: () =>
        Promise.reject(new ApiError("Event not found", 404, "SCHEDULED_EVENT_NOT_FOUND")),
    });

    const result = await eventReminderRoute(
      request({ enabled: true, minutesBefore: 10 }),
      EVENT_ID,
      deps,
    );

    assert.equal(result.status, 404);
  });
});
