import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminAnalytics, getCohortCellAlpha } from "@/components/admin/sections/admin-analytics";
import { buildUsageSeries, countFirstTouchByPlatform } from "@/lib/admin/snapshots/analytics";
import type { AdminAnalyticsSnapshot } from "@/lib/admin/snapshots/analytics";

const NOW = new Date("2026-07-27T12:00:00.000Z");

function snapshot(overrides: Partial<AdminAnalyticsSnapshot> = {}): AdminAnalyticsSnapshot {
  return {
    cohorts: [
      { retainedDay1: 5, retainedDay7: 2, retainedDay30: 0, signups: 10, weekStart: "2026-07-20" },
    ],
    funnel: [
      { count: 100, platformSplittable: false, step: "signup" },
      { count: 80, platformSplittable: false, step: "email_verified" },
      { count: 60, platformSplittable: true, step: "first_session" },
      { count: 40, platformSplittable: true, step: "first_message" },
    ],
    generatedAt: NOW.toISOString(),
    legacyMobileClients: {
      clear: false,
      maxVersion: "0.9.0",
      sessions: 6,
      versions: [{ appVersion: "0.8.15", sessions: 6 }],
      windowDays: 30,
    },
    platform: "ALL",
    range: { days: 3, end: NOW.toISOString(), start: NOW.toISOString() },
    usageSeries: [
      { date: "2026-07-25", directMessages: 4, messages: 20, uploads: 1, voiceMinutes: 12 },
      { date: "2026-07-26", directMessages: 6, messages: 30, uploads: 2, voiceMinutes: 8 },
      { date: "2026-07-27", directMessages: 0, messages: 10, uploads: 0, voiceMinutes: 0 },
    ],
    ...overrides,
  };
}

describe("analytics aggregation", () => {
  it("fills every day of the window from sparse metric rows", () => {
    const series = buildUsageSeries(
      [
        {
          clientType: "MOBILE",
          date: new Date("2026-07-26T00:00:00.000Z"),
          dmMessageCount: 2,
          fileUploadCount: 1,
          messageCount: 5,
          userId: "u1",
          voiceSeconds: 120,
        },
      ],
      3,
      new Date("2026-07-25T00:00:00.000Z"),
    );

    assert.deepEqual(
      series.map((day) => ({ date: day.date, messages: day.messages, voice: day.voiceMinutes })),
      [
        { date: "2026-07-25", messages: 0, voice: 0 },
        { date: "2026-07-26", messages: 5, voice: 2 },
        { date: "2026-07-27", messages: 0, voice: 0 },
      ],
    );
  });

  it("counts a person once, on the platform they arrived with", () => {
    const counts = countFirstTouchByPlatform([
      { clientType: "MOBILE", userId: "u1" },
      { clientType: "WEB", userId: "u1" },
      { clientType: "UNKNOWN", userId: "u2" },
    ]);

    assert.deepEqual(counts, { ALL: 2, MOBILE: 1, UNKNOWN: 1 });
  });

  it("leaves an unmeasured retention cell unshaded", () => {
    assert.equal(getCohortCellAlpha(null), 0);
    assert.ok(getCohortCellAlpha(100) > getCohortCellAlpha(10));
  });
});

describe("analytics screen", () => {
  it("marks the steps a platform filter cannot narrow", () => {
    const markup = renderToStaticMarkup(<AdminAnalytics snapshot={snapshot()} />);
    const labels = markup.match(/platform kırılımı yok/gu) ?? [];

    assert.equal(labels.length, 2, "signup and email verification carry the caveat");
    assert.match(markup, /Aktivasyon hunisi/u);
  });

  it("keeps the pre-migration data note on the chart", () => {
    const markup = renderToStaticMarkup(<AdminAnalytics snapshot={snapshot()} />);

    assert.match(markup, /platformsuz kaydedildi/u);
  });

  it("shows the selected platform chip as the active tab", () => {
    const markup = renderToStaticMarkup(
      <AdminAnalytics snapshot={snapshot({ platform: "UNKNOWN" })} />,
    );

    assert.match(markup, /aria-selected="true"[^>]*href="\/admin\/analytics\?platform=UNKNOWN"/u);
  });

  it("reports an empty cohort window instead of an empty table", () => {
    const markup = renderToStaticMarkup(<AdminAnalytics snapshot={snapshot({ cohorts: [] })} />);

    assert.match(markup, /Bu aralıkta kayıt yok/u);
  });
});
