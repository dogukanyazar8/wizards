import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminHealth, getHealthBandTone } from "@/components/admin/sections/admin-health";
import { buildHealthDailyTicks, computeCrashRate } from "@/lib/admin/snapshots/health";
import type { AdminHealthSnapshot } from "@/lib/admin/snapshots/health";

const NOW = new Date("2026-07-27T12:00:00.000Z");

function platform(overrides: Partial<AdminHealthSnapshot["platforms"][number]> = {}) {
  return {
    activeSessions: 12,
    crashCount: 1,
    crashRatePercent: 0.4,
    errorCount: 3,
    platform: "MOBILE" as const,
    sessionCount: 250,
    startupP50Ms: 820,
    startupP95Ms: 1900,
    versions: [{ count: 200, label: "0.8.15" }],
    ...overrides,
  };
}

function snapshot(overrides: Partial<AdminHealthSnapshot> = {}): AdminHealthSnapshot {
  return {
    generatedAt: NOW.toISOString(),
    platforms: [platform()],
    pushAcceptance: [
      { acceptanceRatePercent: 98.5, acceptedCount: 197, platform: "android", rejectedCount: 3 },
    ],
    range: { days: 14, end: NOW.toISOString(), start: NOW.toISOString() },
    ticks: buildHealthDailyTicks([], NOW),
    ...overrides,
  };
}

describe("health measurements", () => {
  it("reports no crash rate when there were no sessions to divide by", () => {
    assert.equal(computeCrashRate(0, 0), null);
    assert.equal(computeCrashRate(3, 0), null);
    assert.equal(computeCrashRate(1, 200), 0.5);
  });

  it("fills every day of the window even where nothing happened", () => {
    const ticks = buildHealthDailyTicks(
      [
        { createdAt: new Date("2026-07-26T10:00:00.000Z"), kind: "CRASH" },
        { createdAt: new Date("2026-07-26T11:00:00.000Z"), kind: "ERROR" },
      ],
      NOW,
    );

    assert.equal(ticks.length, 30);
    assert.equal(ticks.at(-1)?.date, "2026-07-27");

    const yesterday = ticks.find((tick) => tick.date === "2026-07-26");
    assert.deepEqual(yesterday, { crashes: 1, date: "2026-07-26", errors: 1 });
  });

  it("keeps the status band neutral until something has been measured", () => {
    assert.equal(getHealthBandTone([platform({ crashRatePercent: null })]), "neutral");
    assert.equal(getHealthBandTone([platform({ crashRatePercent: 0.1 })]), "success");
    assert.equal(getHealthBandTone([platform({ crashRatePercent: 1 })]), "warning");
    assert.equal(getHealthBandTone([platform({ crashRatePercent: 5 })]), "danger");
  });
});

describe("health screen", () => {
  it("says 'veri yok' instead of zero when a platform has no sessions", () => {
    const markup = renderToStaticMarkup(
      <AdminHealth
        snapshot={snapshot({
          platforms: [
            platform({
              crashRatePercent: null,
              sessionCount: 0,
              startupP50Ms: null,
              startupP95Ms: null,
            }),
          ],
        })}
      />,
    );

    assert.match(markup, /veri yok/u);
  });

  it("labels the push card as acceptance, never as delivery", () => {
    const markup = renderToStaticMarkup(<AdminHealth snapshot={snapshot()} />);

    assert.match(markup, /Expo kabul oranı/u);
    assert.doesNotMatch(markup, /teslim/iu);
  });

  it("keeps the delivery word out of the health module source", () => {
    const sources = [
      "src/components/admin/sections/admin-health.tsx",
      "src/lib/admin/snapshots/health.ts",
    ];

    for (const source of sources) {
      assert.doesNotMatch(
        readFileSync(source, "utf8"),
        /teslim/iu,
        `${source} promises delivery, but Expo only reports acceptance`,
      );
    }
  });
});
