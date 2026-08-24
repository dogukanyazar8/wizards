import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planPresenceUpdate, resolveExpiredFocus, resolveFocusState, type FocusRow } from "./focus";

const NOW = new Date("2026-08-19T12:00:00.000Z");

function row(overrides: Partial<FocusRow> = {}): FocusRow {
  return {
    id: "u1",
    status: "ONLINE",
    statusExpiresAt: null,
    statusFocusMinutes: null,
    statusRestoreTo: null,
    ...overrides,
  };
}

describe("resolveExpiredFocus", () => {
  it("returns only the rows whose window already closed", () => {
    const rows = [
      row({
        id: "past",
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T11:59:59.000Z"),
        statusRestoreTo: "IDLE",
      }),
      row({ id: "exactly-now", status: "DND", statusExpiresAt: NOW, statusRestoreTo: "ONLINE" }),
      row({
        id: "future",
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T12:00:01.000Z"),
        statusRestoreTo: "ONLINE",
      }),
      row({ id: "no-focus" }),
    ];

    assert.deepEqual(
      resolveExpiredFocus(rows, NOW).map(({ status, userId }) => ({ status, userId })),
      [
        { status: "IDLE", userId: "past" },
        { status: "ONLINE", userId: "exactly-now" },
      ],
    );
  });

  it("falls back to ONLINE when the restore target was lost", () => {
    const rows = [row({ id: "u9", status: "DND", statusExpiresAt: NOW, statusRestoreTo: null })];

    assert.deepEqual(
      resolveExpiredFocus(rows, NOW).map(({ status, userId }) => ({ status, userId })),
      [{ status: "ONLINE", userId: "u9" }],
    );
  });

  it("never reads the clock itself", () => {
    const rows = [
      row({
        status: "DND",
        statusExpiresAt: new Date("2020-01-01T00:00:00.000Z"),
        statusRestoreTo: "ONLINE",
      }),
    ];

    // A `now` in the far past means "nothing has expired yet" even though the
    // wall clock says otherwise — proof the time is a parameter.
    assert.deepEqual(resolveExpiredFocus(rows, new Date("2019-01-01T00:00:00.000Z")), []);
    assert.equal(resolveExpiredFocus([], NOW).length, 0);
  });
});

describe("resolveFocusState", () => {
  it("reports no focus when the window is unset", () => {
    assert.deepEqual(resolveFocusState(row({ status: "IDLE" }), NOW), {
      expired: false,
      focus: null,
      presence: "IDLE",
    });
  });

  it("counts the remaining minutes of a live window", () => {
    const state = resolveFocusState(
      row({
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T12:14:30.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "ONLINE",
      }),
      NOW,
    );

    assert.deepEqual(state, {
      expired: false,
      focus: {
        active: true,
        expiresAt: "2026-08-19T12:14:30.000Z",
        minutesLeft: 15,
        totalMinutes: 25,
      },
      presence: "DND",
    });
  });

  it("resolves an expired window to its restore target without touching the database", () => {
    const state = resolveFocusState(
      row({
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T11:00:00.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "IDLE",
      }),
      NOW,
    );

    assert.deepEqual(state, { expired: true, focus: null, presence: "IDLE" });
  });

  it("publishes a stored INVISIBLE as OFFLINE", () => {
    assert.equal(resolveFocusState(row({ status: "INVISIBLE" }), NOW).presence, "OFFLINE");
  });

  it("falls back to the remaining time when the length was never recorded", () => {
    const state = resolveFocusState(
      row({
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T12:10:00.000Z"),
        statusFocusMinutes: null,
        statusRestoreTo: "ONLINE",
      }),
      NOW,
    );

    assert.deepEqual(state.focus, {
      active: true,
      expiresAt: "2026-08-19T12:10:00.000Z",
      minutesLeft: 10,
      totalMinutes: 10,
    });
  });
});

describe("planPresenceUpdate", () => {
  it("opens a focus window and remembers where to return", () => {
    const plan = planPresenceUpdate({
      body: { focus: { enabled: true, minutes: 25 } },
      now: NOW,
      row: row({ status: "IDLE" }),
    });

    assert.deepEqual(plan.data, {
      status: "DND",
      statusExpiresAt: new Date("2026-08-19T12:25:00.000Z"),
      statusFocusMinutes: 25,
      statusRestoreTo: "IDLE",
    });
    assert.deepEqual(plan.result, {
      focus: {
        active: true,
        expiresAt: "2026-08-19T12:25:00.000Z",
        minutesLeft: 25,
        totalMinutes: 25,
      },
      presence: "DND",
    });
  });

  it("is idempotent: the same body twice does not extend the window", () => {
    const opened = planPresenceUpdate({
      body: { focus: { enabled: true, minutes: 25 } },
      now: NOW,
      row: row({ status: "IDLE" }),
    });

    const stored = row({
      status: "DND",
      statusExpiresAt: opened.data.statusExpiresAt ?? null,
      statusFocusMinutes: opened.data.statusFocusMinutes ?? null,
      statusRestoreTo: opened.data.statusRestoreTo ?? null,
    });

    const repeated = planPresenceUpdate({
      body: { focus: { enabled: true, minutes: 25 } },
      now: new Date("2026-08-19T12:05:00.000Z"),
      row: stored,
    });

    assert.equal(repeated.changed, false);
    assert.deepEqual(repeated.data.statusExpiresAt, opened.data.statusExpiresAt);
    assert.deepEqual(repeated.result.focus, {
      active: true,
      expiresAt: "2026-08-19T12:25:00.000Z",
      minutesLeft: 20,
      totalMinutes: 25,
    });
    // Re-opening must not overwrite the first restore target either.
    assert.equal(repeated.data.statusRestoreTo, "IDLE");
  });

  it("treats a different duration as a new intent", () => {
    const stored = row({
      status: "DND",
      statusExpiresAt: new Date("2026-08-19T12:25:00.000Z"),
      statusFocusMinutes: 25,
      statusRestoreTo: "IDLE",
    });

    const plan = planPresenceUpdate({
      body: { focus: { enabled: true, minutes: 50 } },
      now: NOW,
      row: stored,
    });

    assert.equal(plan.changed, true);
    assert.deepEqual(plan.data.statusExpiresAt, new Date("2026-08-19T12:50:00.000Z"));
    assert.equal(plan.data.statusRestoreTo, "IDLE");
  });

  it("closes the window back onto the remembered status", () => {
    const plan = planPresenceUpdate({
      body: { focus: { enabled: false } },
      now: NOW,
      row: row({
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T12:25:00.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "IDLE",
      }),
    });

    assert.deepEqual(plan.data, {
      status: "IDLE",
      statusExpiresAt: null,
      statusFocusMinutes: null,
      statusRestoreTo: null,
    });
    assert.deepEqual(plan.result, { focus: null, presence: "IDLE" });
  });

  it("stores INVISIBLE as OFFLINE", () => {
    const plan = planPresenceUpdate({
      body: { presence: "INVISIBLE" },
      now: NOW,
      row: row({ status: "ONLINE" }),
    });

    assert.equal(plan.data.status, "OFFLINE");
    assert.equal(plan.result.presence, "OFFLINE");
  });

  it("retargets the window instead of breaking it when a chip is picked during focus", () => {
    const plan = planPresenceUpdate({
      body: { presence: "ONLINE" },
      now: NOW,
      row: row({
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T12:25:00.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "IDLE",
      }),
    });

    assert.equal(plan.data.status, "DND");
    assert.equal(plan.data.statusRestoreTo, "ONLINE");
    assert.deepEqual(plan.data.statusExpiresAt, new Date("2026-08-19T12:25:00.000Z"));
    assert.equal(plan.result.presence, "DND");
  });

  it("resolves an already expired window before applying the body", () => {
    const plan = planPresenceUpdate({
      body: { presence: "IDLE" },
      now: NOW,
      row: row({
        status: "DND",
        statusExpiresAt: new Date("2026-08-19T11:00:00.000Z"),
        statusFocusMinutes: 25,
        statusRestoreTo: "ONLINE",
      }),
    });

    assert.deepEqual(plan.data, {
      status: "IDLE",
      statusExpiresAt: null,
      statusFocusMinutes: null,
      statusRestoreTo: null,
    });
    assert.equal(plan.changed, true);
  });
});
