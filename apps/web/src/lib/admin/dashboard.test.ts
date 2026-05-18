import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDailyMetricSeries,
  getDashboardDateRange,
  normalizeDashboardDays,
} from "@/lib/admin/dashboard";

describe("admin dashboard helpers", () => {
  it("normalizes dashboard windows to the supported range", () => {
    assert.equal(normalizeDashboardDays("30"), 30);
    assert.equal(normalizeDashboardDays("abc"), 14);
    assert.equal(normalizeDashboardDays(0), 1);
    assert.equal(normalizeDashboardDays(365), 90);
  });

  it("builds UTC dashboard ranges", () => {
    const range = getDashboardDateRange(7, new Date("2026-05-12T18:30:00.000Z"));

    assert.equal(range.rangeStart.toISOString(), "2026-05-06T00:00:00.000Z");
    assert.equal(range.rangeEnd.toISOString(), "2026-05-13T00:00:00.000Z");
  });

  it("fills missing daily series buckets", () => {
    const series = buildDailyMetricSeries(
      3,
      [
        {
          appSeconds: 120,
          cameraSeconds: 0,
          date: new Date("2026-05-11T09:00:00.000Z"),
          dmMessageCount: 1,
          fileUploadCount: 2,
          messageCount: 4,
          screenShareSeconds: 0,
          sessionCount: 1,
          uploadedBytes: 256n,
          userId: "user-1",
          voiceSeconds: 60,
        },
      ],
      new Date("2026-05-12T12:00:00.000Z"),
    );

    assert.deepEqual(
      series.map((day) => ({
        appSeconds: day.appSeconds,
        date: day.date,
        messageCount: day.messageCount,
        uploadedBytes: day.uploadedBytes,
      })),
      [
        { appSeconds: 0, date: "2026-05-10", messageCount: 0, uploadedBytes: 0 },
        { appSeconds: 120, date: "2026-05-11", messageCount: 5, uploadedBytes: 256 },
        { appSeconds: 0, date: "2026-05-12", messageCount: 0, uploadedBytes: 0 },
      ],
    );
  });
});
