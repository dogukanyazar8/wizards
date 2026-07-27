import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminVoice } from "@/components/admin/sections/admin-voice";
import {
  averageDurationSeconds,
  buildHourlyHistogram,
  type AdminVoiceSnapshot,
} from "@/lib/admin/snapshots/voice";

const NOW = new Date("2026-07-27T14:00:00.000Z");

function snapshot(overrides: Partial<AdminVoiceSnapshot> = {}): AdminVoiceSnapshot {
  return {
    averageCallSeconds: 930,
    callsLast24h: 42,
    concurrentVoice: 7,
    generatedAt: NOW.toISOString(),
    hourly: buildHourlyHistogram([new Date("2026-07-27T13:00:00.000Z")], NOW),
    liveChannels: [
      {
        channelId: "channel-1",
        name: "genel-ses",
        participantCount: 4,
        server: { id: "server-1", name: "Whispr HQ" },
      },
    ],
    platforms: [
      { count: 30, platform: "MOBILE" },
      { count: 12, platform: "WEB" },
    ],
    ...overrides,
  };
}

describe("voice aggregation", () => {
  it("spreads calls across all 24 UTC hours and marks the current one", () => {
    const hours = buildHourlyHistogram(
      [new Date("2026-07-27T13:10:00.000Z"), new Date("2026-07-27T13:40:00.000Z")],
      NOW,
    );

    assert.equal(hours.length, 24);
    assert.equal(hours[13]?.count, 2);
    assert.equal(hours[14]?.isCurrent, true);
    assert.equal(hours[0]?.count, 0);
  });

  it("reports an unmeasured average instead of zero", () => {
    assert.equal(averageDurationSeconds([]), null);
    assert.equal(averageDurationSeconds([100, 200]), 150);
  });
});

describe("voice screen", () => {
  it("renders the live channels with their participant counts", () => {
    const markup = renderToStaticMarkup(<AdminVoice snapshot={snapshot()} />);

    assert.match(markup, /genel-ses/u);
    assert.match(markup, /Whispr HQ/u);
    assert.match(markup, /4 kişi/u);
  });

  it("says so when nobody is in voice", () => {
    const markup = renderToStaticMarkup(
      <AdminVoice snapshot={snapshot({ averageCallSeconds: null, liveChannels: [] })} />,
    );

    assert.match(markup, /Şu anda açık ses kanalı yok/u);
    assert.match(markup, /veri yok/u);
  });

  it("never promises call quality the platform does not measure", () => {
    const markup = renderToStaticMarkup(<AdminVoice snapshot={snapshot()} />);

    for (const forbidden of [/MOS/u, /gecikme/iu, /bölge/iu]) {
      assert.doesNotMatch(markup, forbidden);
    }

    assert.doesNotMatch(
      readFileSync("src/components/admin/sections/admin-voice.tsx", "utf8"),
      /MOS|jitter/u,
    );
  });
});
