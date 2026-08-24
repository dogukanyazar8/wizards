import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FOCUS_DEFAULT_MINUTES,
  planFocusToggle,
  planPresencePick,
  projectExpiredFocus,
} from "@/lib/home/focus-machine";
import type { AppSummaryResponse } from "@/lib/home/types";

/**
 * `06-faz5` §3.1 — the client half of the focus state machine, as pure
 * arithmetic. `now` is always a parameter; nothing here reads the clock.
 *
 * The server owns the truth (`lib/home/focus.ts`); this file owns what the
 * screen is allowed to show *before* the truth arrives, and the two have to
 * agree or the optimistic write flickers.
 */

const NOW = new Date("2026-08-19T12:00:00.000Z");

function summary(overrides: Partial<AppSummaryResponse> = {}): AppSummaryResponse {
  return {
    dateLabel: NOW.toISOString(),
    dmUnread: 0,
    focus: null,
    greetingName: "Alice",
    pendingReplies: 0,
    presence: "ONLINE",
    unreadMentions: 0,
    ...overrides,
  };
}

const OPEN_FOCUS = {
  active: true as const,
  expiresAt: "2026-08-19T12:25:00.000Z",
  minutesLeft: 25,
  totalMinutes: 25,
};

describe("focus machine — four transitions", () => {
  it("closed → open: DND now, previous status remembered, window ends now + 25", () => {
    const plan = planFocusToggle({ now: NOW, summary: summary({ presence: "IDLE" }) });

    assert.deepEqual(plan.body, { focus: { enabled: true, minutes: FOCUS_DEFAULT_MINUTES } });
    assert.equal(plan.optimistic.presence, "DND");
    assert.deepEqual(plan.optimistic.focus, {
      active: true,
      expiresAt: "2026-08-19T12:25:00.000Z",
      minutesLeft: 25,
      totalMinutes: 25,
    });
    assert.equal(plan.restoreTo, "IDLE");
  });

  it("open → closed by toggle: status returns to what the window remembered", () => {
    const plan = planFocusToggle({
      now: NOW,
      restoreTo: "IDLE",
      summary: summary({ focus: OPEN_FOCUS, presence: "DND" }),
    });

    assert.deepEqual(plan.body, { focus: { enabled: false } });
    assert.equal(plan.optimistic.presence, "IDLE");
    assert.equal(plan.optimistic.focus, null);
  });

  it("open → closed by expiry: the same return, and no request is planned", () => {
    const projection = projectExpiredFocus({
      now: new Date("2026-08-19T12:25:00.000Z"),
      restoreTo: "IDLE",
      summary: summary({ focus: OPEN_FOCUS, presence: "DND" }),
    });

    assert.deepEqual(projection, { focus: null, presence: "IDLE" });
  });

  it("expiry projection leaves an unexpired window alone", () => {
    const untouched = summary({ focus: OPEN_FOCUS, presence: "DND" });

    assert.equal(
      projectExpiredFocus({ now: new Date("2026-08-19T12:24:59.000Z"), summary: untouched }),
      null,
    );
  });

  it("expiry falls back to ONLINE when nothing recorded a return target", () => {
    assert.deepEqual(
      projectExpiredFocus({
        now: new Date("2026-08-19T13:00:00.000Z"),
        summary: summary({ focus: OPEN_FOCUS, presence: "DND" }),
      }),
      { focus: null, presence: "ONLINE" },
    );
  });
});

describe("focus machine — presence chips", () => {
  it("chip while focus is closed changes the visible status", () => {
    const plan = planPresencePick({ next: "IDLE", summary: summary() });

    assert.deepEqual(plan?.body, { presence: "IDLE" });
    assert.equal(plan?.optimistic.presence, "IDLE");
    assert.equal(plan?.optimistic.focus, null);
    assert.equal(plan?.restoreTo, undefined);
  });

  it("chip while focus is open moves the return target, not the visible status", () => {
    const plan = planPresencePick({
      next: "ONLINE",
      summary: summary({ focus: OPEN_FOCUS, presence: "DND" }),
    });

    assert.deepEqual(plan?.body, { presence: "ONLINE" });
    // The design's "Çevrimiçi selected + DND on" picture: the chip is chosen,
    // the published status stays DND until the window closes.
    assert.equal(plan?.optimistic.presence, "DND");
    assert.deepEqual(plan?.optimistic.focus, OPEN_FOCUS);
    assert.equal(plan?.restoreTo, "ONLINE");
  });

  it("second tap on the already-selected chip plans nothing", () => {
    assert.equal(planPresencePick({ next: "ONLINE", summary: summary() }), null);
  });

  it("re-picking the live return target while focus is open also plans nothing", () => {
    assert.equal(
      planPresencePick({
        next: "IDLE",
        restoreTo: "IDLE",
        summary: summary({ focus: OPEN_FOCUS, presence: "DND" }),
      }),
      null,
    );
  });

  it("INVISIBLE is a client word: it is sent as INVISIBLE and shown as OFFLINE", () => {
    const plan = planPresencePick({ next: "OFFLINE", summary: summary() });

    assert.deepEqual(plan?.body, { presence: "INVISIBLE" });
    assert.equal(plan?.optimistic.presence, "OFFLINE");
  });
});

describe("focus machine — selected chip", () => {
  it("selects the return target while focus is open, the status otherwise", async () => {
    const { selectPresenceChip } = await import("@/lib/home/focus-machine");

    assert.equal(selectPresenceChip({ summary: summary({ presence: "IDLE" }) }), "IDLE");
    assert.equal(
      selectPresenceChip({
        restoreTo: "ONLINE",
        summary: summary({ focus: OPEN_FOCUS, presence: "DND" }),
      }),
      "ONLINE",
    );
    // No local pick yet: the window's own status is the honest answer.
    assert.equal(
      selectPresenceChip({ summary: summary({ focus: OPEN_FOCUS, presence: "DND" }) }),
      "DND",
    );
  });
});
